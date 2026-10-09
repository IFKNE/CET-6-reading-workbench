from playwright.sync_api import expect, sync_playwright


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
        assert page.locator("#word-source-trigger").count() == 1
        assert page.locator("#word-source-panel").is_hidden()
        assert page.locator("#word-quick-filters").count() == 1
        page.locator("#article-input").fill(ARTICLE)
        page.get_by_role("button", name="开始精读").click()
        assert page.locator("#reader-view").is_visible()
        # 需要可用的 /api/translate（DeepSeek Key + 网络）；离线环境下这几步会超时失败。
        page.locator(".word-token").first.click()
        page.locator(".save-word").click()
        expect(page.locator(".save-word.is-saved")).to_have_count(1)
        expect(page.locator(".word-detail-link")).to_be_visible()
        page.locator(".word-detail-link").click()
        expect(page.locator("#word-detail-view")).to_be_visible()
        expect(page.get_by_role("button", name="返回原文")).to_be_visible()
        page.get_by_role("button", name="返回原文").click()
        expect(page.locator("#reader-view")).to_be_visible()
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
        expect(page.locator("#word-source-trigger")).to_be_visible()
        page.locator("#word-source-trigger").click()
        expect(page.locator("#word-source-panel")).to_be_visible()
        expect(page.locator("#word-source-panel .source-row").first).to_be_visible()
        page.locator("#word-source-panel .source-row", has_text="未关联文章").locator("input[type=checkbox]").check()
        expect(page.locator("#word-source-label")).to_have_text("来源：未关联文章")
        expect(page.locator("#word-source-clear")).to_be_visible()
        page.locator("#word-source-clear").click()
        expect(page.locator("#word-source-label")).to_have_text("来源：全部单词")
        # 点“×”清空筛选后面板必须保持打开（#word-source-clear 在面板与 trigger 之外）。
        expect(page.locator("#word-source-panel")).to_be_visible()
        page.keyboard.press("Escape")
        expect(page.locator("#word-source-panel")).to_be_hidden()
        assert page.locator(".wordbook-row").count() == 1
        assert page.locator(".wordbook-row").inner_text().startswith("critical")
        with page.expect_download() as download_info:
            page.get_by_role("button", name="导出为 Markdown").click()
        assert download_info.value.suggested_filename == "cet6-wordbook.md"
        assert page.get_by_role("button", name="导出为 Word").is_visible()
        page.screenshot(path="test/e2e-screenshot.png", full_page=True)
        assert not console_errors, console_errors
        browser.close()


if __name__ == "__main__":
    main()
