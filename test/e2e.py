from playwright.sync_api import sync_playwright


ARTICLE = "Reading critically helps students separate evidence from opinion.\n\nThis habit improves judgment in everyday life."


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        console_errors = []
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)

        page.goto("http://localhost:3000")
        page.wait_for_load_state("networkidle")
        assert page.title() == "六级精读工作台"
        assert page.locator("#article-category").is_visible()
        assert page.locator("#open-library").is_visible()
        assert page.locator("#theme-toggle").is_visible()
        assert page.locator("#library-view").count() == 1
        assert page.locator("#wordbook-view").count() == 1
        assert page.locator("#word-search").count() == 1
        assert page.locator("#word-source-filter").count() == 1
        assert page.locator("#word-quick-filters").count() == 1
        page.locator("#article-input").fill(ARTICLE)
        page.get_by_role("button", name="开始精读").click()
        assert page.locator("#reader-view").is_visible()
        assert page.locator(".article-paragraph").count() == 2
        assert page.locator(".word-token").count() > 10
        assert page.locator("#save-article").is_visible()
        assert page.locator("#key-vocabulary").is_visible()
        assert page.locator("#reading-book-title").is_visible()
        assert page.locator("#reading-progress").is_visible()
        assert page.locator(".book-page-footer").is_visible()

        page.evaluate("localStorage.setItem('cet6:wordbook', JSON.stringify([{word:'critical', meaning:'批判性的', partOfSpeech:'adj.', context:'Reading critically helps students.', savedAt:'2026-10-05'}]))")
        page.reload()
        page.wait_for_load_state("networkidle")
        page.get_by_role("button", name="单词本 1").click()
        assert page.locator(".wordbook-item").count() == 1
        assert page.locator(".wordbook-item").inner_text().startswith("critical")
        with page.expect_download() as download_info:
            page.get_by_role("button", name="导出为 Markdown").click()
        assert download_info.value.suggested_filename == "cet6-wordbook.md"
        assert page.get_by_role("button", name="导出为 Word").is_visible()
        page.screenshot(path="test/e2e-screenshot.png", full_page=True)
        assert not console_errors, console_errors
        browser.close()


if __name__ == "__main__":
    main()
