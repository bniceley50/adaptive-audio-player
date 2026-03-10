import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Choose how your audiobook sounds",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Import a book" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Account",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load portfolio demo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 3,
      name: "Show the same product through three different listening moments",
    }),
  ).toBeVisible();
});

test("user can create an account, revoke other sessions, and sign out", async ({
  browser,
  page,
}) => {
  const uniqueEmail = `gillian-session-${Date.now()}@example.com`;

  await page.goto("/");

  await page.getByLabel("Display name").fill("Gillian");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page
    .getByRole("button", { name: "Create account and sync this library" })
    .click();

  await expect(page.getByText("Gillian", { exact: true })).toBeVisible();
  await expect(page.getByText(uniqueEmail)).toBeVisible();
  await expect(page.getByText("Session timeline")).toBeVisible();
  await expect(page.getByText("Current session")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out session" }),
  ).toHaveCount(0);

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await secondPage.goto("/");
  await secondPage.getByLabel("Display name").fill("Gillian");
  await secondPage.getByLabel("Email").fill(uniqueEmail);
  await secondPage
    .getByRole("button", { name: "Create account and sync this library" })
    .click();
  await expect(secondPage.getByText("Session timeline")).toBeVisible();
  await secondContext.close();

  await page.reload();
  await expect(page.getByText("Signed-in session")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out this session" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Sign out other sessions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out other sessions" }).click();
  await expect(page.getByText("Signed-in session")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign out other sessions" }),
  ).toHaveCount(0);
  await expect(page.getByText("Session timeline")).toBeVisible();
  await expect(page.getByText(/Signed out elsewhere from/i)).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Sign out" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Create account and sync this library" }),
  ).toBeVisible();
});

test("signed-in user can switch to another linked workspace", async ({ page }) => {
  const uniqueEmail = `gillian-switch-${Date.now()}@example.com`;

  await page.goto("/");
  await page.getByLabel("Display name").fill("Gillian");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page
    .getByRole("button", { name: "Create account and sync this library" })
    .click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.goto("/import");
  await page.getByLabel("Book title").fill("First Shelf");
  await page.getByLabel("Or paste text").fill("Chapter 1\nFirst workspace book.");
  await page.getByRole("button", { name: "Preview chapters" }).click();
  await page.getByRole("button", { name: "Continue to voice setup" }).click();

  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Create account and sync this library" }),
  ).toBeVisible();

  const secondDisplayNameInput = page.getByLabel("Display name");
  const secondEmailInput = page.getByLabel("Email");
  await secondDisplayNameInput.fill("Gillian");
  await secondEmailInput.fill(uniqueEmail);
  await page
    .getByRole("button", { name: "Create account and sync this library" })
    .click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.goto("/import");
  await page.getByLabel("Book title").fill("Second Shelf");
  await page.getByLabel("Or paste text").fill("Chapter 1\nSecond workspace book.");
  await page.getByRole("button", { name: "Preview chapters" }).click();
  await page.getByRole("button", { name: "Continue to voice setup" }).click();

  await page.goto("/");
  await expect(page.getByText("2 synced books")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch and open First Shelf" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch and open First Shelf" }).click();
  await page.waitForURL("**/books/demo-book-1");

  await expect(
    page.getByRole("heading", { level: 1, name: "First Shelf" }),
  ).toBeVisible();
});

test("import page previews parsed chapters from pasted text", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/import");

  await page.getByLabel("Book title").fill("Storm Harbor");
  await page.getByLabel("Or paste text").fill(
    "Chapter 1\nIt was a wet night.\n\nChapter 2\nThe city woke late.",
  );
  await page.getByRole("button", { name: "Preview chapters" }).click();

  await expect(
    page.getByRole("heading", { level: 3, name: "Chapter 1" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Chapter 2" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to voice setup" }).click();
  await page.waitForURL("**/books/demo-book-1");
  await expect(
    page.getByRole("heading", { level: 1, name: "Storm Harbor" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("heading", { level: 2, name: "Choose narrator" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("heading", { level: 2, name: "Imported chapters" }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Immersive" }).click();
  await page.getByLabel("Sloane").check();
  await page.getByRole("button", { name: "Save as default taste" }).click();
  await expect(
    page.getByText("Generate sample to unlock player"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate sample" }).click();
  await expect(
    page.getByText("Generated for this setup"),
  ).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Queue full-book generation" }).click();
  await expect(
    page.getByText("Generated on backend"),
  ).toBeVisible({ timeout: 10000 });
  await page.reload();
  await expect(
    page.getByText("Generated on backend"),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByText("Current audio versions", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Listen current full book" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Listen to full book" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open generated sample" }).click();
  await page.waitForURL("**/player/demo-book-1**");
  await expect(
    page.getByRole("heading", { level: 1, name: "Now playing Storm Harbor" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator("audio")).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("Narrator", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("Sloane", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("Mode").locator("..").getByText("immersive", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("Sample audio is ready in this player."),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("heading", { level: 2, name: "Chapter 1" }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Play sample" }).click();
  await expect(
    page.getByRole("button", { name: "Pause sample" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Forward 30" }).click();
  await expect(page.getByText("1:13", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Speed: 1x" }).click();
  await expect(
    page.getByRole("button", { name: "Speed: 1.15x" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add bookmark" }).click();
  await expect(
    page.getByRole("button", { name: "Bookmarked" }),
  ).toBeVisible();
  await expect(
    page.getByText("Chapter 1 · 1:13"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Jump to bookmark" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sleep timer: Off" }).click();
  await expect(
    page.getByRole("button", { name: "Sleep timer: 15 min" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save playback defaults" }).click();
  await page.getByRole("button", { name: "Chapter 2" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Chapter 2" }),
  ).toBeVisible();
  await expect(page.getByText("The city woke late.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Speed: 1.15x" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add bookmark" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sleep timer: 15 min" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Chapter 2" }),
  ).toBeVisible();
  await expect(
    page.getByText("Chapter 1 · 1:13"),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Books: 1")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Continue listening" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Storm Harbor" }).first(),
  ).toBeVisible();
  const stormHarborShelfCard = page.getByTestId("shelf-book-demo-book-1");
  await expect(
    stormHarborShelfCard.locator("span").filter({ hasText: "Saved taste" }).first(),
  ).toBeVisible();
  await stormHarborShelfCard
    .getByRole("button", { name: "Show taste details" })
    .click();
  await expect(
    page.getByText("This book already has its own saved listening profile"),
  ).toBeVisible();
  await expect(
    stormHarborShelfCard.getByText("Narrator: Sloane"),
  ).toBeVisible();
  await expect(page.getByText("Mode: ambient")).not.toBeVisible();
  await expect(
    stormHarborShelfCard.getByText("Mode: immersive"),
  ).toBeVisible();
  await expect(
    stormHarborShelfCard.getByText("Resumes sample audio"),
  ).toBeVisible();
  await expect(
    stormHarborShelfCard.getByText(/Updated /),
  ).toBeVisible();
  await expect(page.getByText("Chapter 2", { exact: true })).toBeVisible();
  await expect(page.getByText("0:00 listened", { exact: true })).toBeVisible();
  await expect(
    page.getByText("0% through this chapter", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Bookmarks: 1", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Continue listening" }).click();
  await page.waitForURL("**/player/demo-book-1**");
  await expect(
    page.getByText("Sample audio is ready in this player."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Chapter 2" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Jump to bookmark" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Chapter 1" }),
  ).toBeVisible();
  await expect(page.getByText("1:13", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to setup" }).click();
  await page.waitForURL("**/books/demo-book-1**");
  await expect(
    page.getByText("This book is using its saved taste: Sloane in immersive."),
  ).toBeVisible();
  await expect(
    page.getByText("This book already has its own saved listening profile"),
  ).toBeVisible();
  await expect(page.getByLabel("Sloane")).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Immersive" }),
  ).toHaveClass(/border-stone-950/);
  await page.goto("/player/demo-book-1");
  await expect(
    page.getByText("This player is using this book's saved taste: Sloane in immersive."),
  ).toBeVisible();
  await expect(
    page.getByText("Sample audio is ready in this player."),
  ).toBeVisible();
  await expect(
    page.getByText("This book already has its own saved listening profile"),
  ).toBeVisible();
  await expect(
    page.getByText("Sloane", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Mode").locator("..").getByText("immersive", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.goto("/player/demo-book-1");
  await expect(
    page.getByRole("heading", { level: 1, name: "Now playing Storm Harbor" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("This player is using this book's saved taste: Sloane in immersive."),
  ).toBeVisible();
  await expect(
    page.getByText("Sample audio is ready in this player."),
  ).toBeVisible();

  await page.goto("/import");
  await page.getByLabel("Book title").fill("Quiet Harbor");
  await page.getByLabel("Or paste text").fill(
    "Chapter 1\nMorning found the harbor quiet.\n\nChapter 2\nGulls circled above the pier.",
  );
  await page.getByRole("button", { name: "Preview chapters" }).click();
  await page.getByRole("button", { name: "Continue to voice setup" }).click();
  await page.waitForURL("**/books/demo-book-2");
  await expect(
    page.getByText("This new book is starting from your default taste: Sloane in immersive."),
  ).toBeVisible();
  await expect(
    page.getByText("This book has not been customized yet, so it is borrowing your global default taste for new imports."),
  ).toBeVisible();
  await expect(page.getByLabel("Sloane")).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Immersive" }),
  ).toHaveClass(/border-stone-950/);
  await page.goto("/");
  await expect(page.getByText("Books: 2")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Cloud library preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Storm Harbor" }).nth(1),
  ).toBeVisible();
  await expect(
    page.getByText("Full book ready").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Last session: Chapter 1 · 1:13 · sample"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Storm Harbor" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Current full book" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Quiet Harbor" }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("shelf-book-demo-book-2")
      .locator("span")
      .filter({ hasText: "Default taste" })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("New imports will start from Sloane in immersive."),
  ).toBeVisible();
  await expect(
    page.getByText("New player sessions start from 1.15x with 15 minute sleep timer."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Recent render activity" }),
  ).toBeVisible();
  await expect(page.getByText("Latest cloud listening")).toBeVisible();
  await expect(
    page.getByText("Storm Harbor · Chapter 1 · 1:13"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Resume sample" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Recent cloud listening" }),
  ).toBeVisible();
  const recentListeningSection = page.locator("section").filter({
    has: page.getByRole("heading", { level: 3, name: "Recent cloud listening" }),
  });
  await expect(
    recentListeningSection
      .locator("span")
      .filter({ hasText: "Sample" })
      .first(),
  ).toBeVisible();
  await expect(
    recentListeningSection.getByRole("link", { name: "Resume sample" }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Updated .*ago|Updated just now/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open render history" })).toBeVisible();
  await expect(page.getByText("Library sync completed").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Listen full book" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Open render history" }).click();
  await page.waitForURL("**/jobs");
  await expect(
    page.getByRole("heading", { level: 1, name: "Generation and sync history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Per-book generation history" }),
  ).toBeVisible();
  await expect(page.getByText("Full-book generation completed").first()).toBeVisible();
  await expect(page.getByText("Book Storm Harbor · Chapters 2")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Listen current full book" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Listen in player" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open current full-book render" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open current full-book render" }).click();
  await page.waitForURL("**/player/demo-book-1**artifactId=**");
  await expect(
    page.getByText("You are listening to the current approved render for this book."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review render timeline" }),
  ).toBeVisible();
  await page.goto("/jobs");
  await page.getByRole("link", { name: "Back home" }).click();
  await page.waitForURL("**/");
  await expect(
    page.getByRole("heading", { level: 2, name: "How taste works" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Start with taste" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue listening" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start with default taste" })).toBeVisible();
  await page.getByRole("button", { name: "Start with taste" }).click();
  await expect(
    page.getByRole("heading", { level: 3, name: "Quiet Harbor" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "All books" }).click();
  await page.getByLabel("Search your shelf").fill("quiet");
  await expect(
    page.getByRole("heading", { level: 3, name: "Quiet Harbor" }).first(),
  ).toBeVisible();
  await page.getByLabel("Search your shelf").fill("");
  await page.goto("/player/demo-book-2");
  await expect(
    page.getByRole("button", { name: "Speed: 1.15x" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sleep timer: 15 min" }),
  ).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: "Needs setup" }).click();
  await expect(
    page.getByText("No books match this filter yet. Try a different shelf state or clear the search."),
  ).toBeVisible();
  await page.getByRole("button", { name: "All books" }).click();
  const quietHarborShelfCard = page.getByTestId("shelf-book-demo-book-2");
  await quietHarborShelfCard.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Rename book").fill("Quiet Harbor Revised");
  await page.getByRole("button", { name: "Save title" }).click();
  await expect(
    page.getByRole("heading", { level: 3, name: "Quiet Harbor Revised" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear default taste" }).click();
  await expect(page.getByText("No default taste saved yet.")).toBeVisible();
  await page
    .getByTestId("shelf-book-demo-book-1")
    .getByRole("button", { name: "Make this the default" })
    .click();
  await expect(
    page.getByText("New imports will start from Sloane in immersive."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Import with this taste" }).click();
  await page.waitForURL("**/import");
  await expect(
    page.getByText("New books will start from your default taste: Sloane in immersive. Existing books keep their own saved taste."),
  ).toBeVisible();
  await page.goto("/");
  const continueListeningSection = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { level: 2, name: "Continue listening" }),
    });
  const quietHarborShelfHeading = continueListeningSection.getByRole("heading", {
    level: 3,
    name: "Quiet Harbor Revised",
  });
  const renamedQuietHarborShelfCard = page.getByTestId("shelf-book-demo-book-2");
  await page
    .getByTestId("shelf-book-demo-book-2")
    .getByRole("button", { name: "Delete book" })
    .click();
  await renamedQuietHarborShelfCard
    .getByRole("button", { name: "Confirm delete" })
    .click();
  await expect(page.getByText("Books: 1")).toBeVisible();
  await expect(quietHarborShelfHeading).not.toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Recently removed" }),
  ).toBeVisible();
  const recentlyRemovedSection = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { level: 3, name: "Recently removed" }),
    });
  await expect(recentlyRemovedSection.getByText("Quiet Harbor Revised")).toBeVisible();
  await page.goto("/books/demo-book-2");
  await expect(
    page.getByRole("heading", { level: 1, name: "Quiet Harbor Revised needs recovery" }),
  ).toBeVisible();
  const bookRecoveryCard = page.locator("section").filter({
    has: page.getByRole("heading", {
      level: 2,
      name: "Quiet Harbor Revised was removed from your library",
    }),
  });
  await bookRecoveryCard.getByRole("button", { name: "Restore this book" }).click();
  await expect(page.getByText("Books: 2")).toBeVisible();
  await expect(
    quietHarborShelfHeading,
  ).toBeVisible();
  await renamedQuietHarborShelfCard.getByRole("button", { name: "Delete book" }).click();
  await renamedQuietHarborShelfCard
    .getByRole("button", { name: "Confirm delete" })
    .click();
  await page.goto("/player/demo-book-2");
  await expect(
    page.getByRole("heading", { level: 1, name: "Quiet Harbor Revised needs recovery" }),
  ).toBeVisible();
  const playerRecoveryCard = page.locator("section").filter({
    has: page.getByRole("heading", {
      level: 2,
      name: "Quiet Harbor Revised was removed from your library",
    }),
  });
  await playerRecoveryCard.getByRole("button", { name: "Dismiss recovery" }).click();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 3, name: "Recently removed" }),
  ).not.toBeVisible();
  await page.goto("/player/demo-book-1");
  await expect(
    page.getByText("This player is using this book's saved taste: Sloane in immersive."),
  ).toBeVisible();
  await expect(
    page.getByText("This book already has its own saved listening profile"),
  ).toBeVisible();
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/");
  const restoredStormHarborShelfCard = page.getByTestId("shelf-book-demo-book-1");
  await expect(
    page.getByRole("heading", { level: 3, name: "Storm Harbor" }).first(),
  ).toBeVisible();
  await expect(
    restoredStormHarborShelfCard.getByText("Saved taste"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Playback defaults" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear playback defaults" }).click();
  await page.goto("/");
  await expect(page.getByText("No playback defaults saved yet.")).toBeVisible();
});
