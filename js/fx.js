// Kill effects (cosmetics) and other little floating visuals.
import { THREE, burst, textSprite } from './engine.js';
import { G } from './state.js';
import { sfx } from './audio.js';

const floaters = [];
function floatSprite(text, pos, { rise = 4, life = 1.6, scale = .9, spread = 1.5 } = {}) {
  const s = textSprite(text, { bg: null, scale, font: 'bold 64px "Segoe UI Emoji","Apple Color Emoji",Arial' });
  s.position.copy(pos).add(new THREE.Vector3((Math.random() - .5) * spread, Math.random(), (Math.random() - .5) * spread));
  G.scene.add(s); floaters.push({ s, rise, life, age: 0 });
}
export function updateFx(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.age += dt; f.s.position.y += f.rise * dt;
    f.s.material.opacity = Math.max(0, 1 - f.age / f.life);
    if (f.age >= f.life) { G.scene.remove(f.s); f.s.material.map.dispose(); floaters.splice(i, 1); }
  }
}

// Plays the killer's chosen kill effect where the victim died.
export function killEffect(kind, pos, teamColor) {
  const p = pos.clone(); p.y += 2.5;
  switch (kind) {
    case 'kill_hearts': burst(p, 0xff5fa8, 22, 9); for (let i = 0; i < 6; i++) floatSprite('💖', p, { rise: 3 + Math.random() * 2 }); break;
    case 'kill_fireworks':
      for (let i = 0; i < 4; i++) setTimeout(() => { const q = p.clone().add(new THREE.Vector3((Math.random() - .5) * 4, 3 + Math.random() * 4, (Math.random() - .5) * 4)); burst(q, [0xff5252, 0xffe45c, 0x38c6ff, 0x4dff8a, 0xb47dff][i % 5], 26, 16, .9); sfx.pop(); }, i * 180);
      break;
    case 'kill_coins': burst(p, 0xffd34e, 30, 12); for (let i = 0; i < 7; i++) floatSprite('🪙', p, { rise: 5, spread: 3 }); sfx.pickup(); break;
    case 'kill_lightning': {
      const bolt = new THREE.Mesh(new THREE.BoxGeometry(.6, 60, .6), new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true }));
      bolt.position.copy(p).add(new THREE.Vector3(0, 28, 0)); G.scene.add(bolt);
      let t = 0; const tick = () => { t += .05; bolt.material.opacity = Math.max(0, 1 - t); bolt.scale.x = bolt.scale.z = 1 + Math.sin(t * 40) * .5; if (t < 1) requestAnimationFrame(tick); else G.scene.remove(bolt); }; tick();
      burst(p, 0xffffff, 26, 14); burst(p, 0x7ad7ff, 16, 10); sfx.boom(); G.match?.shake?.(.4);
      break;
    }
    case 'kill_ghost': floatSprite('👻', p, { rise: 2.2, life: 2.6, scale: 1.6, spread: 0 }); burst(p, 0xdddddd, 14, 6); break;
    case 'kill_rainbow': [0xff5252, 0xffb13b, 0xffe45c, 0x4dff8a, 0x38c6ff, 0xb47dff].forEach((c, i) => setTimeout(() => burst(p, c, 12, 12), i * 60)); floatSprite('🌈', p, { rise: 3, scale: 1.4, spread: 0 }); break;
    default: burst(p, teamColor ?? 0xffffff, 18, 12);
  }
}
