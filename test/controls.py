import asyncio, json, math
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width':852,'height':393}, device_scale_factor=2, has_touch=True, is_mobile=True)
        page = await ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
        await page.goto(__import__('pathlib').Path(__file__).resolve().parent.parent.joinpath('index.html').as_uri()); await page.wait_for_timeout(500)
        cdp = await ctx.new_cdp_session(page); H=393
        async def touch(kind, pts): await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x':x,'y':y,'id':i} for i,(x,y) in pts]})
        await touch('touchStart', [(0,(426,200))]); await touch('touchEnd', [])
        await page.evaluate("() => { const g=window.__oath.game; g.boss.idle_time=999; g.player.gy=g.boss.gy-110; }")
        btn = await page.evaluate("() => { const c=window.__oath.controls, o={}; for (const b of c.buttons) o[b.kind]=[b.cx, H=0||b.cy]; o.stick=c.stick.home; return o; }")
        sp = lambda xy: (xy[0], H-xy[1])
        async def state(): return await page.evaluate("() => { const g=window.__oath.game, p=g.player; return {state:p.state, kind:p.kind, combo:p.combo, bossHp:Math.round(g.boss.hp), facing:Math.round(p.facing*57.3), gy:Math.round(p.gy), sprint:p.sprinting, stam:Math.round(p.stamina), bullets:p.bullets, flasks:p.flasks}; }")
        lx,ly=sp(btn['light'])
        out=[]
        for i in range(3):
            await touch('touchStart', [(2,(lx,ly))]); await page.wait_for_timeout(50); await touch('touchEnd', [])
            await page.wait_for_timeout(330); out.append(await state())
        print('3 light taps:', [ (s['kind'], s['combo']) for s in out ], 'boss hp', out[-1]['bossHp'])
        await page.wait_for_timeout(600)
        # multitouch: walk right with stick while tapping dodge
        sx,sy=sp(btn['stick'])
        await touch('touchStart', [(1,(sx,sy))]); await touch('touchMove', [(1,(sx+50,sy))]); await page.wait_for_timeout(400)
        s1=await state()
        dx,dy=sp(btn['dodge'])
        await touch('touchStart', [(1,(sx+50,sy)),(3,(dx,dy))]); await page.wait_for_timeout(40)
        s2=await state()
        await touch('touchEnd', [(1,(sx+50,sy))]); await page.wait_for_timeout(500)
        print('walk right facing', s1['facing'], '| dodge while walking ->', s2['state'])
        await touch('touchMove', [(1,(sx+95,sy))]); await page.wait_for_timeout(500); s3=await state()
        print('stick at edge -> sprinting', s3['sprint'], 'stamina', s3['stam'])
        await touch('touchEnd', []); await page.wait_for_timeout(600)
        # heavy hold-drag aim + release
        hx,hy=sp(btn['heavy'])
        await touch('touchStart', [(4,(hx,hy))]); await touch('touchMove', [(4,(hx,hy-40))]); await page.wait_for_timeout(900)
        s4=await state()
        await touch('touchEnd', []); await page.wait_for_timeout(60); s5=await state()
        print('hold heavy 0.9s dragging up: facing', s4['facing'], '-> released kind', s5['kind'])
        await page.wait_for_timeout(1200)
        px,py=sp(btn['shoot']); await touch('touchStart', [(5,(px,py))]); await page.wait_for_timeout(40); await touch('touchEnd', []); await page.wait_for_timeout(100)
        fx,fy=sp(btn['flask']); await page.wait_for_timeout(500); await touch('touchStart', [(6,(fx,fy))]); await touch('touchEnd', []); await page.wait_for_timeout(100)
        s6=await state(); print('pistol + flask -> bullets', s6['bullets'], 'flasks', s6['flasks'])
        await page.screenshot(path='test/07_controls.png')
        print('\n'.join(errs) or 'no page errors')
        await b.close()
asyncio.run(main())
