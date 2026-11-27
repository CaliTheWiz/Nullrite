import asyncio, json, math, random
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width':852,'height':393}, device_scale_factor=2, has_touch=True, is_mobile=True)
        page = await ctx.new_page()
        errs=[]
        page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
        page.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
        await page.goto(__import__('pathlib').Path(__file__).resolve().parent.parent.joinpath('index.html').as_uri()); await page.wait_for_timeout(800)
        await page.screenshot(path='test/01_title.png')
        cdp = await ctx.new_cdp_session(page)
        H=393
        async def touch(kind, pts):
            await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x':x,'y':y,'id':i} for i,(x,y) in pts]})
        await touch('touchStart', [(0,(426,200))]); await touch('touchEnd', [])
        await page.wait_for_timeout(300)
        btn = await page.evaluate("""() => { const c=window.__nullrite.controls; const o={}; for (const b of c.buttons) o[b.kind]=[b.cx, b.cy]; o.stick=c.stick.home; return o; }""")
        def sp(xy): return (xy[0], H-xy[1])
        # hold stick up (walk toward boss) while tapping LIGHT with a second finger -> multitouch
        sx,sy = sp(btn['stick'])
        await touch('touchStart', [(1,(sx,sy))])
        await touch('touchMove', [(1,(sx,sy-50))])
        await page.wait_for_timeout(700)
        lx,ly = sp(btn['light'])
        for i in range(3):
            await touch('touchStart', [(1,(sx,sy-50)),(2,(lx,ly))]); await page.wait_for_timeout(60)
            await touch('touchEnd', [(1,(sx,sy-50))]); await page.wait_for_timeout(260)
        await page.screenshot(path='test/03_attack.png')
        st = await page.evaluate("() => { const g=window.__nullrite.game; return {p:g.player.state, kind:g.player.kind, combo:g.player.combo, bossHp:g.boss.hp, hp:g.player.hp}; }")
        print('after walking + 3 lights:', json.dumps(st))
        await touch('touchEnd', [])
        # random soak for ~25s of real time with multi-finger input
        random.seed(1)
        kinds=list(btn.keys())
        for i in range(250):
            k=random.choice(kinds); x,y=sp(btn[k])
            if k=='stick':
                a=random.uniform(0,6.28); r=random.choice((40,90))
                await touch('touchStart', [(5,(x,y))]); await touch('touchMove', [(5,(x+r*math.cos(a), y+r*math.sin(a)))])
            else:
                await touch('touchStart', [(6,(x,y))])
                if random.random()<0.5: await touch('touchMove', [(6,(x+random.uniform(-40,40), y+random.uniform(-40,40)))])
            await page.wait_for_timeout(random.choice((30,60,120)))
            await touch('touchEnd', [])
            if i==120: await page.screenshot(path='test/04_mid.png')
            o = await page.evaluate("() => window.__nullrite.game.outcome")
            if o:
                await page.wait_for_timeout(2600); await page.screenshot(path='test/05_outcome.png')
                r = await page.evaluate("() => window.__nullrite.controls.ui.retry")
                if r: await touch('touchStart', [(7,(r['x'], H-r['y']))]); await touch('touchEnd', [])
        st = await page.evaluate("""() => { const g=window.__nullrite.game; const v=[g.player.gx,g.player.gy,g.boss.gx,g.boss.gy,g.player.hp,g.boss.hp]; return {finite:v.every(Number.isFinite), fps: window.__nullrite.controls.ui.fps, outcome:g.outcome}; }""")
        print('soak:', json.dumps(st))
        # portrait -> rotate screen
        await page.set_viewport_size({'width':393,'height':852}); await page.wait_for_timeout(400)
        await page.screenshot(path='test/06_rotate.png')
        print('\n'.join(errs) or 'no console errors')
        await b.close()
asyncio.run(main())
