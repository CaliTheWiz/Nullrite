"""Headless Chrome: trigger phase 2, screenshot the roar, crimson runes and slam waves; check audio drone state."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
URL = Path(__file__).resolve().parent.parent.joinpath('index.html').as_uri()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 852, 'height': 393}, device_scale_factor=2, has_touch=True, is_mobile=True)
        page = await ctx.new_page(); errs = []
        page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
        await page.goto(URL); await page.wait_for_timeout(800)
        await page.touchscreen.tap(426, 200); await page.evaluate('window.__nullrite.game.startFight(true)'); await page.wait_for_timeout(1200)
        await page.evaluate("""() => { const g = window.__nullrite.game, B = g.boss, P = g.player, {BOSS_ATTACKS, BOSS_MAX_HP, PLAYER_MAX_HP} = window.__nullrite.C;
            B.idle_time = 999; P.gx = 0; P.gy = B.gy - 160; B.hp = BOSS_MAX_HP * 0.5 + 5;
            g.hitBoss(30, 5, -Math.PI / 2, false, false); }""")
        await page.wait_for_timeout(450); await page.screenshot(path='test/08_phase_roar.png')
        await page.wait_for_timeout(2600)
        await page.evaluate("""() => { const g = window.__nullrite.game, B = g.boss, P = g.player, {BOSS_ATTACKS, BOSS_MAX_HP, PLAYER_MAX_HP} = window.__nullrite.C;
            B.idle_time = 999; B.gx = 0; B.gy = 60; P.gx = 0; P.gy = -420; P.hp = PLAYER_MAX_HP;
            B.chooseAttack(0); B.kind = 'slam'; B.atk = Object.assign({}, BOSS_ATTACKS.slam, {hop: 0}); B.beginAttack(P); }""")
        await page.wait_for_timeout(2000); await page.screenshot(path='test/09_phase_waves.png')
        info = await page.evaluate("""() => { const o = window.__nullrite, g = o.game, d = o.sound.drone;
            return {phase: g.boss.phase, mix: +g.phaseMix.toFixed(2), state: g.boss.state, waves: g.waves.filter(w => w.live).length,
                    hp: g.player.hp, drone: d ? {on: d.on, phase: d.phase} : null, fps: o.controls.ui.fps}; }""")
        print(json.dumps(info)); print('\n'.join(errs) or 'no console errors')
        await b.close()
asyncio.run(main())
