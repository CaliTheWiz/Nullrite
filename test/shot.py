import asyncio, sys, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width':852,'height':393}, device_scale_factor=2, has_touch=True, is_mobile=True)
        page = await ctx.new_page()
        errs=[]
        page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
        page.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
        await page.goto(__import__('pathlib').Path(__file__).resolve().parent.parent.joinpath('index.html').as_uri())
        await page.wait_for_timeout(1500)
        await page.screenshot(path='test/01_title.png')
        await page.touchscreen.tap(426, 200)
        await page.wait_for_timeout(2500)
        await page.screenshot(path='test/02_play.png')
        info = await page.evaluate("""() => { const g=window.__nullrite.game; return {state:g.player.state, bossState:g.boss.state, p:[g.player.gx,g.player.gy], b:[g.boss.gx,g.boss.gy], fps: window.__nullrite.controls.ui.fps}; }""")
        print(json.dumps(info))
        print('\n'.join(errs) or 'no console errors')
        await b.close()
asyncio.run(main())
