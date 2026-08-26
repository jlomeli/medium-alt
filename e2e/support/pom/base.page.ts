import type { Page, Locator } from "@playwright/test";

/**
 * Base class for all Page Objects.
 *
 * Two rules for every subclass — see docs/CODING_STANDARDS.md §Testing:
 *   1. Constructor takes `page`; assigns locators to public readonly fields.
 *   2. Locators are role/label/text first. `data-testid` is an escape hatch
 *      and requires a comment explaining why no accessible affordance was
 *      possible.
 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  abstract readonly url: string;

  async goto(): Promise<void> {
    await this.page.goto(this.url);
  }

  /** Escape hatch — use sparingly. */
  protected byTestId(id: string): Locator {
    return this.page.getByTestId(id);
  }
}
