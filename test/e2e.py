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
        # 回归：面板内部的点击会同步重建整块面板（renderSourcePanel 里的 replaceChildren），
        # 被点的元素在事件冒泡到 document 之前就已脱离文档；document 上的“点面板外关闭”处理器
        # 若用 contains(event.target)，会因为 target 已脱离而误判成外部点击，把面板立刻关掉
        # （用户报的“点文件夹的 › 打不开”就是这个）。这里用面板内部的「清空来源筛选」按钮守这条：
        # 它的 click 处理器同样走 applySourceSelection → renderWordbook → renderSourceFilter →
        # renderSourcePanel，重建面板的时机与 › 完全一致。
        page.locator("#word-source-panel .source-clear-all").click()
        expect(page.locator("#word-source-panel")).to_be_visible()
        # 文件夹层（点 › 进入 / 点面包屑返回）无法在下面这组夹具里覆盖：本测试只往 localStorage
        # 种了 1 个「没有来源」的单词，而且从未保存过精读文章（IndexedDB 为空），来源树根层因此
        # 只有「全部单词 / 未关联文章」两行，没有可点的 .source-enter。要覆盖它，需要先有文件夹
        # 数据（页面上保存一篇文章进文件夹，或直接种 IndexedDB 的 articles/folders）。
        # 该路径目前由带文件夹数据的探针场景覆盖（TEMP 下 cet6probe-bubble 的 source-folder-open：
        # 点 › → 面板仍可见 → 面包屑可见 → 返回根层）。下面这条断言是“夹具前提”的守卫：
        # 一旦这里补上了带文件夹的文章，它会失败，提醒你把上面那四步真正补进来。
        assert page.locator("#word-source-panel .source-enter").count() == 0
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
