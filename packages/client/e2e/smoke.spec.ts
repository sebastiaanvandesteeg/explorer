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

test("start an expedition, build a house, and a friend joins", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill("Anna");
  await page.getByRole("radio", { name: /Northfolk/ }).click();
  await expect(page.getByRole("radio", { name: /Northfolk/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "Start a new expedition" }).click();
  await expect(page).toHaveURL(/\/w\/[a-z0-9]{8}$/);
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
  await page.goto("/?offline&seed=e2e&tribe=sylvan");
  await expect(page.locator("#app > canvas")).toBeVisible();
  await expect(page.locator(".players")).toContainText("Offline game");
  await expect(page.locator(".players")).toContainText("Sylvan");
  await expect(page.locator('.resource[data-res="pop"]')).toHaveText("3/5");
  // The world has a time of day, which every player sees on the HUD clock.
  await expect(page.locator(".clock")).toContainText(/Day 1 · \w+ · \d\d:\d\d/);
});
