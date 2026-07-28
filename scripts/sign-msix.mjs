import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  approvedMakeAppxProductVersion,
  readWindowsProductVersion,
} from "./build-msix.mjs";

const secretEnvironmentNames = Object.freeze([
  "MSIX_SIGNING_PFX_BASE64",
  "MSIX_SIGNING_PFX_PASSWORD",
]);
const codeSigningExtendedKeyUsage = "1.3.6.1.5.5.7.3.3";
const proofPackageName = "AdaptiveAudioPlayer.UnsignedProof";
const temporaryDirectoryPrefix = "adaptive-audio-signing-";
const defaultWindowsSdkRoot = path.join(
  process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
  "Windows Kits",
  "10",
  "bin",
  "10.0.26100.0",
  "x64",
);
const defaultMakeAppxPath = path.join(defaultWindowsSdkRoot, "makeappx.exe");
const defaultSignToolPath = path.join(defaultWindowsSdkRoot, "signtool.exe");

function usage() {
  return [
    "Usage: node scripts/sign-msix.mjs --input <unsigned.msix> --output <test-signed.msix>",
    "       --evidence <signing-evidence.json> [--makeappx <MakeAppx.exe>] [--signtool <SignTool.exe>]",
    "       node scripts/sign-msix.mjs --audit-workflow <workflow.yml>",
  ].join("\n");
}

export function parseArguments(argv) {
  if (argv[0] === "--audit-workflow") {
    if (argv.length !== 2 || !argv[1]) {
      throw new Error(`--audit-workflow requires exactly one path.\n${usage()}`);
    }
    return { auditWorkflow: path.resolve(argv[1]) };
  }
  const values = {};
  const allowed = new Set([
    "--input",
    "--output",
    "--evidence",
    "--makeappx",
    "--signtool",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!allowed.has(argument)) {
      throw new Error(`Unknown argument: ${argument}\n${usage()}`);
    }
    if (Object.hasOwn(values, argument)) {
      throw new Error(`Duplicate argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}.\n${usage()}`);
    }
    values[argument] = value;
    index += 1;
  }
  for (const required of ["--input", "--output", "--evidence"]) {
    if (!values[required]) {
      throw new Error(`${required} is required.\n${usage()}`);
    }
  }
  return {
    inputPackage: path.resolve(values["--input"]),
    outputPackage: path.resolve(values["--output"]),
    evidencePath: path.resolve(values["--evidence"]),
    makeAppxPath: path.resolve(values["--makeappx"] ?? defaultMakeAppxPath),
    signToolPath: path.resolve(values["--signtool"] ?? defaultSignToolPath),
  };
}

export function auditSigningWorkflow(source) {
  if (/\bpull_request(?:_target)?\s*:/u.test(source)) {
    throw new Error("Signing workflow must not declare a pull-request trigger.");
  }
  for (const required of [
    "workflow_dispatch:",
    "tags:",
    "github.ref_type == 'tag'",
    "name: msix-signing-proof",
    "contents: read",
    "persist-credentials: false",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Signing workflow is missing required protection: ${required}`);
    }
  }
  const actionReferences = [...source.matchAll(/^\s*uses:\s*([^\s#]+).*$/gmu)].map(
    (match) => match[1],
  );
  if (actionReferences.length === 0) {
    throw new Error("Signing workflow must declare its pinned actions.");
  }
  for (const reference of actionReferences) {
    if (!/@[0-9a-f]{40}$/u.test(reference)) {
      throw new Error(`Signing action is not pinned to an immutable commit: ${reference}`);
    }
  }
  const signStepStart = source.indexOf(
    "- name: Sign and verify protected test package",
  );
  const nextStepStart = source.indexOf("\n      - name:", signStepStart + 1);
  if (signStepStart < 0 || nextStepStart < 0) {
    throw new Error("Signing workflow must isolate the protected signing step.");
  }
  const signingStep = source.slice(signStepStart, nextStepStart);
  const outsideSigningStep =
    source.slice(0, signStepStart) + source.slice(nextStepStart);
  for (const secretName of secretEnvironmentNames) {
    const secretReference = `secrets.${secretName}`;
    if (!signingStep.includes(secretReference)) {
      throw new Error(`Signing step is missing ${secretReference}.`);
    }
    if (outsideSigningStep.includes(secretReference)) {
      throw new Error(`${secretReference} must be scoped only to the signing step.`);
    }
  }
  return {
    actionReferences,
    environment: "msix-signing-proof",
    pullRequestTrigger: false,
    signingSecretsStepScoped: true,
  };
}

export function assertProtectedSigningContext(environment = process.env) {
  const eventName = environment.GITHUB_EVENT_NAME;
  if (environment.GITHUB_ACTIONS !== "true") {
    throw new Error("Protected MSIX signing is available only in GitHub Actions.");
  }
  if (!["push", "workflow_dispatch"].includes(eventName)) {
    throw new Error(`Protected MSIX signing rejects GitHub event: ${eventName ?? "missing"}.`);
  }
  if (environment.GITHUB_REF_TYPE !== "tag") {
    throw new Error("Protected MSIX signing requires a tag ref.");
  }
  if (!/^refs\/tags\/v[^\s]+$/u.test(environment.GITHUB_REF ?? "")) {
    throw new Error("Protected MSIX signing requires a v-prefixed tag.");
  }
  if (!/^[0-9a-f]{40}$/u.test(environment.GITHUB_SHA ?? "")) {
    throw new Error("Protected MSIX signing requires an exact source commit SHA.");
  }
  if (!/^[^/\s]+\/[^/\s]+$/u.test(environment.GITHUB_REPOSITORY ?? "")) {
    throw new Error("Protected MSIX signing requires repository provenance.");
  }
  if (!/^\d+$/u.test(environment.GITHUB_RUN_ID ?? "")) {
    throw new Error("Protected MSIX signing requires a GitHub run id.");
  }
  if (!/^\d+$/u.test(environment.GITHUB_RUN_ATTEMPT ?? "")) {
    throw new Error("Protected MSIX signing requires a GitHub run attempt.");
  }
  return {
    eventName,
    repository: environment.GITHUB_REPOSITORY,
    ref: environment.GITHUB_REF,
    commit: environment.GITHUB_SHA,
    runId: environment.GITHUB_RUN_ID,
    runAttempt: environment.GITHUB_RUN_ATTEMPT,
  };
}

function requireEnvironment(name, environment = process.env) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} must be configured in the protected environment.`);
  return value;
}

function readSigningConfiguration(environment = process.env) {
  const mode = requireEnvironment("MSIX_SIGNING_MODE", environment);
  if (mode !== "test") {
    throw new Error(
      "Task 11 permits only test signing; production identity and channel approval are still required.",
    );
  }
  const expectedPublisher = requireEnvironment(
    "MSIX_EXPECTED_PUBLISHER",
    environment,
  );
  const timestampUrl = new URL(
    requireEnvironment("MSIX_TIMESTAMP_URL", environment),
  );
  if (timestampUrl.protocol !== "https:") {
    throw new Error("MSIX_TIMESTAMP_URL must use HTTPS RFC 3161 timestamping.");
  }
  const pfxBase64 = requireEnvironment(
    "MSIX_SIGNING_PFX_BASE64",
    environment,
  );
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(pfxBase64)) {
    throw new Error("MSIX_SIGNING_PFX_BASE64 is not valid base64.");
  }
  const pfx = Buffer.from(pfxBase64, "base64");
  if (pfx.length === 0) {
    throw new Error("MSIX_SIGNING_PFX_BASE64 decoded to an empty certificate.");
  }
  requireEnvironment("MSIX_SIGNING_PFX_PASSWORD", environment);
  return { mode, expectedPublisher, timestampUrl: timestampUrl.href, pfx };
}

function sanitizedEnvironment() {
  const environment = { ...process.env };
  for (const name of secretEnvironmentNames) delete environment[name];
  return environment;
}

function run(command, args, { environment = sanitizedEnvironment() } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        reject(
          new Error(
            `${path.basename(command)} exited with code ${code}: ${stderr || stdout}`,
          ),
        );
      }
    });
  });
}

function windowsPowerShellPath() {
  return path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

async function runPowerShell(command, environment = sanitizedEnvironment()) {
  const encodedCommand = Buffer.from(command, "utf16le").toString("base64");
  return run(
    windowsPowerShellPath(),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encodedCommand,
    ],
    { environment },
  );
}

function parseIdentity(manifest) {
  const tag = manifest.match(/<Identity\b[\s\S]*?\/>/u)?.[0];
  if (!tag) throw new Error("Signed package manifest has no Identity element.");
  const attribute = (name) => {
    const match = tag.match(new RegExp(`\\b${name}="([^"]+)"`, "u"));
    if (!match) throw new Error(`Signed package identity is missing ${name}.`);
    return match[1];
  };
  return {
    name: attribute("Name"),
    publisher: attribute("Publisher"),
    version: attribute("Version"),
    architecture: attribute("ProcessorArchitecture"),
  };
}

async function walkFiles(root) {
  const pending = [root];
  const results = [];
  while (pending.length > 0) {
    const current = pending.pop();
    const details = await stat(current);
    if (details.isDirectory()) {
      for (const entry of await readdir(current)) {
        pending.push(path.join(current, entry));
      }
    } else if (details.isFile()) {
      results.push(path.relative(root, current).split(path.sep).join("\\"));
    }
  }
  return results;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const input = createReadStream(filePath);
    input.on("data", (chunk) => hash.update(chunk));
    input.once("error", reject);
    input.once("end", resolve);
  });
  return hash.digest("hex");
}

function assertSafeTemporaryDirectory(directory) {
  const resolved = path.resolve(directory);
  if (
    path.dirname(resolved) !== path.resolve(tmpdir()) ||
    !path.basename(resolved).startsWith(temporaryDirectoryPrefix)
  ) {
    throw new Error(`Refusing to remove an unowned signing directory: ${resolved}`);
  }
  return resolved;
}

async function readCertificateMetadata(pfxPath) {
  const environment = {
    ...sanitizedEnvironment(),
    AAP_SIGNING_PFX_PATH: pfxPath,
    AAP_SIGNING_PFX_PASSWORD: process.env.MSIX_SIGNING_PFX_PASSWORD,
  };
  const command = [
    "$flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet",
    "$certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($env:AAP_SIGNING_PFX_PATH, $env:AAP_SIGNING_PFX_PASSWORD, $flags)",
    "$eku = @($certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | ForEach-Object { $_.EnhancedKeyUsages | ForEach-Object { $_.ObjectId.Value } })",
    "[ordered]@{ subject = $certificate.Subject; thumbprint = $certificate.Thumbprint.ToLowerInvariant(); hasPrivateKey = $certificate.HasPrivateKey; notBefore = $certificate.NotBefore.ToUniversalTime().ToString('o'); notAfter = $certificate.NotAfter.ToUniversalTime().ToString('o'); enhancedKeyUsages = $eku } | ConvertTo-Json -Compress",
  ].join("; ");
  const result = await runPowerShell(command, environment);
  return JSON.parse(result.stdout.trim());
}

async function ensureCertificateAbsent(thumbprint) {
  const environment = {
    ...sanitizedEnvironment(),
    AAP_SIGNING_THUMBPRINT: thumbprint,
  };
  const command = [
    "$locations = @('Cert:\\CurrentUser\\My', 'Cert:\\CurrentUser\\TrustedPeople')",
    "$existing = @($locations | ForEach-Object { Get-Item -LiteralPath (Join-Path $_ $env:AAP_SIGNING_THUMBPRINT) -ErrorAction SilentlyContinue })",
    "if ($existing.Count -ne 0) { throw 'Signing certificate already exists in a temporary target store.' }",
  ].join("; ");
  await runPowerShell(command, environment);
}

async function importTemporaryCertificate({ pfxPath, publicPath, thumbprint }) {
  const environment = {
    ...sanitizedEnvironment(),
    AAP_SIGNING_PFX_PATH: pfxPath,
    AAP_SIGNING_PUBLIC_PATH: publicPath,
    AAP_SIGNING_PFX_PASSWORD: process.env.MSIX_SIGNING_PFX_PASSWORD,
    AAP_SIGNING_THUMBPRINT: thumbprint,
  };
  const command = [
    "$securePassword = ConvertTo-SecureString $env:AAP_SIGNING_PFX_PASSWORD -AsPlainText -Force",
    "$signing = Import-PfxCertificate -FilePath $env:AAP_SIGNING_PFX_PATH -CertStoreLocation 'Cert:\\CurrentUser\\My' -Password $securePassword",
    "if ($signing.Thumbprint -ne $env:AAP_SIGNING_THUMBPRINT) { throw 'Imported signing certificate thumbprint changed.' }",
    "Export-Certificate -Cert $signing -FilePath $env:AAP_SIGNING_PUBLIC_PATH -Force | Out-Null",
    "$trusted = Import-Certificate -FilePath $env:AAP_SIGNING_PUBLIC_PATH -CertStoreLocation 'Cert:\\CurrentUser\\TrustedPeople'",
    "if ($trusted.Thumbprint -ne $env:AAP_SIGNING_THUMBPRINT) { throw 'Temporary trust certificate thumbprint changed.' }",
  ].join("; ");
  await runPowerShell(command, environment);
}

async function removeTemporaryCertificate(thumbprint) {
  const environment = {
    ...sanitizedEnvironment(),
    AAP_SIGNING_THUMBPRINT: thumbprint,
  };
  const command = [
    "$locations = @('Cert:\\CurrentUser\\My', 'Cert:\\CurrentUser\\TrustedPeople')",
    "$locations | ForEach-Object { $candidate = Join-Path $_ $env:AAP_SIGNING_THUMBPRINT; if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate -Force } }",
  ].join("; ");
  await runPowerShell(command, environment);
}

async function readAuthenticodeMetadata(packagePath) {
  const environment = {
    ...sanitizedEnvironment(),
    AAP_SIGNED_PACKAGE_PATH: packagePath,
  };
  const command = [
    "$signature = Get-AuthenticodeSignature -LiteralPath $env:AAP_SIGNED_PACKAGE_PATH",
    "[ordered]@{ status = $signature.Status.ToString(); signerSubject = $signature.SignerCertificate.Subject; signerThumbprint = $signature.SignerCertificate.Thumbprint.ToLowerInvariant(); timestampSubject = $signature.TimeStamperCertificate.Subject; timestampThumbprint = $signature.TimeStamperCertificate.Thumbprint.ToLowerInvariant() } | ConvertTo-Json -Compress",
  ].join("; ");
  const result = await runPowerShell(command, environment);
  return JSON.parse(result.stdout.trim());
}

export async function signAndVerifyMsix({
  inputPackage,
  outputPackage,
  evidencePath,
  makeAppxPath = defaultMakeAppxPath,
  signToolPath = defaultSignToolPath,
}) {
  const context = assertProtectedSigningContext();
  const configuration = readSigningConfiguration();
  const input = path.resolve(inputPackage);
  const output = path.resolve(outputPackage);
  const evidence = path.resolve(evidencePath);
  const makeAppx = path.resolve(makeAppxPath);
  const signTool = path.resolve(signToolPath);
  for (const [label, candidate] of [
    ["Unsigned MSIX", input],
    ["MakeAppx.exe", makeAppx],
    ["SignTool.exe", signTool],
  ]) {
    const details = await stat(candidate).catch(() => null);
    if (!details?.isFile()) throw new Error(`${label} is missing: ${candidate}`);
  }
  if (input === output) throw new Error("Signed output must differ from unsigned input.");
  if (existsSync(output) || existsSync(evidence)) {
    throw new Error("Signed output and evidence paths must not already exist.");
  }
  const [makeAppxVersion, signToolVersion] = await Promise.all([
    readWindowsProductVersion(makeAppx),
    readWindowsProductVersion(signTool),
  ]);
  for (const [label, version] of [
    ["MakeAppx.exe", makeAppxVersion],
    ["SignTool.exe", signToolVersion],
  ]) {
    if (version !== approvedMakeAppxProductVersion) {
      throw new Error(
        `${label} product version must be ${approvedMakeAppxProductVersion}; received ${version}.`,
      );
    }
  }
  const workingDirectory = await mkdtemp(
    path.join(tmpdir(), temporaryDirectoryPrefix),
  );
  const pfxPath = path.join(workingDirectory, "signing.pfx");
  const publicPath = path.join(workingDirectory, "signing.cer");
  const unsignedUnpacked = path.join(workingDirectory, "unsigned");
  const signedUnpacked = path.join(workingDirectory, "signed");
  let certificateStoresTouched = false;
  try {
    await writeFile(pfxPath, configuration.pfx, { mode: 0o600 });
    const certificate = await readCertificateMetadata(pfxPath);
    if (
      certificate.subject !== configuration.expectedPublisher ||
      !certificate.hasPrivateKey ||
      !certificate.enhancedKeyUsages.includes(codeSigningExtendedKeyUsage)
    ) {
      throw new Error(
        "Signing certificate must match the expected publisher, contain a private key, and permit code signing.",
      );
    }
    const now = Date.now();
    if (
      Date.parse(certificate.notBefore) > now ||
      Date.parse(certificate.notAfter) <= now
    ) {
      throw new Error("Signing certificate is not currently valid.");
    }
    await run(makeAppx, [
      "unpack",
      "/p",
      input,
      "/d",
      unsignedUnpacked,
      "/no",
    ]);
    const unsignedFiles = await walkFiles(unsignedUnpacked);
    if (unsignedFiles.some((file) => file.toLowerCase() === "appxsignature.p7x")) {
      throw new Error("Signing input must be an unsigned MSIX package.");
    }
    const identity = parseIdentity(
      await readFile(path.join(unsignedUnpacked, "AppxManifest.xml"), "utf8"),
    );
    if (
      identity.name !== proofPackageName ||
      identity.publisher !== configuration.expectedPublisher
    ) {
      throw new Error(
        "Task 11 accepts only the explicit unsigned-proof identity with an exactly matching certificate subject.",
      );
    }
    await mkdir(path.dirname(output), { recursive: true });
    await mkdir(path.dirname(evidence), { recursive: true });
    await copyFile(input, output);
    await ensureCertificateAbsent(certificate.thumbprint);
    certificateStoresTouched = true;
    await importTemporaryCertificate({
      pfxPath,
      publicPath,
      thumbprint: certificate.thumbprint,
    });
    await run(signTool, [
      "sign",
      "/fd",
      "SHA256",
      "/sha1",
      certificate.thumbprint,
      "/s",
      "My",
      "/tr",
      configuration.timestampUrl,
      "/td",
      "SHA256",
      output,
    ]);
    await run(signTool, ["verify", "/pa", "/all", "/v", output]);
    const authenticode = await readAuthenticodeMetadata(output);
    if (
      authenticode.status !== "Valid" ||
      authenticode.signerSubject !== configuration.expectedPublisher ||
      authenticode.signerThumbprint !== certificate.thumbprint ||
      !authenticode.timestampThumbprint
    ) {
      throw new Error(
        "Signed MSIX failed publisher, certificate, or RFC 3161 timestamp verification.",
      );
    }
    await run(makeAppx, [
      "unpack",
      "/p",
      output,
      "/d",
      signedUnpacked,
      "/no",
    ]);
    const signedFiles = await walkFiles(signedUnpacked);
    if (!signedFiles.some((file) => file.toLowerCase() === "appxsignature.p7x")) {
      throw new Error("Signed MSIX is missing AppxSignature.p7x.");
    }
    const outputDetails = await stat(output);
    const releaseEvidence = {
      schemaVersion: 1,
      status: "test-signed-proof",
      productionReady: false,
      generatedAt: new Date().toISOString(),
      source: context,
      artifact: {
        fileName: path.basename(output),
        bytes: outputDetails.size,
        sha256: await sha256File(output),
        unsignedInputSha256: await sha256File(input),
      },
      packageIdentity: identity,
      signing: {
        mode: configuration.mode,
        digestAlgorithm: "SHA256",
        timestampDigestAlgorithm: "SHA256",
        timestampUrl: configuration.timestampUrl,
        certificateSubject: certificate.subject,
        certificateThumbprint: certificate.thumbprint,
        certificateNotBefore: certificate.notBefore,
        certificateNotAfter: certificate.notAfter,
        timestampSubject: authenticode.timestampSubject,
        timestampThumbprint: authenticode.timestampThumbprint,
        verified: true,
      },
      tools: {
        makeAppxProductVersion: makeAppxVersion,
        signToolProductVersion: signToolVersion,
      },
    };
    await writeFile(evidence, `${JSON.stringify(releaseEvidence, null, 2)}\n`, {
      flag: "wx",
    });
    return releaseEvidence;
  } catch (error) {
    await Promise.all([
      rm(output, { force: true }),
      rm(evidence, { force: true }),
    ]);
    throw error;
  } finally {
    if (certificateStoresTouched) {
      await removeTemporaryCertificate(
        (await readCertificateMetadata(pfxPath)).thumbprint,
      );
    }
    await rm(assertSafeTemporaryDirectory(workingDirectory), {
      force: true,
      recursive: true,
    });
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
  if (options?.auditWorkflow) {
    readFile(options.auditWorkflow, "utf8")
      .then((source) => auditSigningWorkflow(source))
      .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
      .catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
        process.exitCode = 1;
      });
  } else if (options) {
    signAndVerifyMsix(options)
      .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
      .catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
        process.exitCode = 1;
      });
  }
}
