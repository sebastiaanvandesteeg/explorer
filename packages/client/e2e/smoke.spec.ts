import { expect, test, type Page } from "@playwright/test";

type GameHandle = {
  findPlacement(kind: string): { x: number; y: number } | null;
  session: { state: { entities: Map<number, { type: string; kind?: string }> } };
};

const buildings = (page: Page, kind: string) =>
  page.evaluate(
    (k) =>
      [
        ...(window as unknown as { __game: GameHandle }).__game.session.state.entities.values(),
      ].filter((e) => e.type === "building" && e.kind === k).length,
    kind,
  );

test("the landing page shows the game and sets sail to /play", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Explorer");
  // Tribes and biomes come from the game's own definitions.
  await expect(page.locator(".tribe-card")).toHaveCount(9);
  await expect(page.locator(".stats")).toContainText("9 tribes");
  await expect(page.locator(".tribe-card").first()).toContainText("Islanders");
  await expect(page.locator(".biome")).toHaveCount(10);
  await page.getByRole("link", { name: "Set sail" }).first().click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("button", { name: "Start a new expedition" })).toBeVisible();
  // Invite links from before the game moved to /play still lead to the expedition.
  await page.goto("/w/abcd1234");
  await expect(page).toHaveURL(/\/play\/w\/abcd1234$/);
  await expect(page.getByRole("button", { name: "Join the expedition" })).toBeVisible();
});

test("start an expedition, build a house, and a friend joins", async ({ page, browser }) => {
  await page.goto("/play");
  await page.getByPlaceholder("Your name").fill("Anna");
  await page.getByRole("radio", { name: /Northfolk/ }).click();
  await expect(page.getByRole("radio", { name: /Northfolk/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "Start a new expedition" }).click();
  await expect(page).toHaveURL(/\/play\/w\/[a-z0-9]{8}$/);
  await expect(page.locator("#app > canvas")).toBeVisible();
  await expect(page.locator(".players")).toContainText("1 of 8 online");
  await expect(page.locator(".players")).toContainText("Northfolk");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __game: { session: { state: { world: { tribe: string } } } } })
          .__game.session.state.world.tribe,
    ),
  ).toBe("northfolk");
  const wood = page.locator(".resource").first();
  await expect(wood).toHaveText("50");

  // Place a house through the real UI: hotkey, hover, click.
  const spot = await page.evaluate(() =>
    (window as unknown as { __game: GameHandle }).__game.findPlacement("house"),
  );
  expect(spot).not.toBeNull();
  await page.keyboard.press("1");
  await page.mouse.move(spot!.x, spot!.y);
  await page.mouse.click(spot!.x, spot!.y);
  await expect(wood).toHaveText("30");
  expect(await buildings(page, "house")).toBe(1);

  // A friend opens the invite link in a separate browser profile.
  const friendContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const friend = await friendContext.newPage();
  await friend.goto(page.url());
  await friend.getByPlaceholder("Your name").fill("Ben");
  await friend.getByRole("button", { name: "Join the expedition" }).click();
  await expect(friend.locator(".players")).toContainText("2 of 8 online");
  await expect(page.locator(".players")).toContainText("Ben");
  // Both see the same construction site and stockpile.
  await expect.poll(() => buildings(friend, "house")).toBe(1);
  await expect(friend.locator(".resource").first()).toHaveText(/^\d+$/);
  await friendContext.close();
});

test("offline mode plays without a server connection", async ({ page }) => {
  await page.goto("/play?offline&seed=e2e&tribe=sylvan");
  await expect(page.locator("#app > canvas")).toBeVisible();
  await expect(page.locator(".players")).toContainText("Offline game");
  await expect(page.locator(".players")).toContainText("Sylvan");
  await expect(page.locator('.resource[data-res="pop"]')).toHaveText("3/5");
  // The world has a time of day, which every player sees on the HUD clock.
  await expect(page.locator(".clock")).toContainText(/Day 1 · \w+ · \d\d:\d\d/);
});

test("a newer tribe starts on its own home biome with its own buildings", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/play?offline&seed=e2e&tribe=cinderborn");
  await expect(page.locator("#app > canvas")).toBeVisible();
  await expect(page.locator(".players")).toContainText("Cinderborn");
  await expect(page.locator(".clock")).toContainText(/Day 1/);
  expect(errors).toEqual([]);
});
