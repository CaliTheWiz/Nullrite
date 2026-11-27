import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width':852,'height':393}, device_scale_factor=2, has_touch=True, is_mobile=True)
        page = await ctx.new_page(); await page.goto(__import__('pathlib').Path(__file__).resolve().parent.parent.joinpath('index.html').as_uri()); await page.wait_for_timeout(400)
        cdp = await ctx.new_cdp_session(page); H=393
        async def touch(kind, pts): await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x':x,'y':y,'id':i} for i,(x,y) in pts]})
        await touch('touchStart', [(0,(426,200))]); await touch('touchEnd', [])
        await page.evaluate("() => { window.__oath.game.boss.idle_time=999; }")
        await touch('touchStart', [(1,(150,280))])
        for dx in (30,60,95,110):
            await touch('touchMove', [(1,(150+dx,280))]); await page.wait_for_timeout(250)
            print(dx, await page.evaluate("() => { const c=window.__oath.controls, p=window.__oath.game.player; return {raw:c.stick.raw.toFixed(2), id:c.stick.id, req:p.sprint_req, sprint:p.sprinting, state:p.state}; }"))
        await b.close()
asyncio.run(main())
