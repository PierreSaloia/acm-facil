/* GeoArt — Desenho Geométrico (Fase 1): foto → mosaico low-poly.
   O processamento (Delaunay + cores) roda no SERVIDOR (geoArtCompute) —
   aqui: carregar foto, chamar, desenhar o preview e mandar gerar o 3D. */

const GeoArtUI = {
  lang: 'pt',
  tris: null,
  dims: null,
  mesh3d: null,     // { verts, faces } (glTF: Y pra cima)
  rot3d: 0.6,       // rotação do preview (rad), arrastável

  dicts: {
    pt: {
      titulo: 'Desenho Geométrico', subtitulo: 'Foto → mosaico low-poly em ACM (quadro geométrico).',
      secImagem: '1 · IMAGEM', secGeo: '2 · GEOMÉTRICO', secSaida: '3 · SAÍDA (ACM)',
      btnCarregar: 'Carregar foto (JPG/PNG)', btnProcessar: 'Processar (gerar o geométrico)',
      btnGerar: 'Gerar mosaico 3D',
      pontos: 'Densidade (triângulos)', removerFundo: 'Remover fundo (cor dos cantos)',
      tol: 'Tolerância do fundo', largura: 'Largura final (mm)', espessura: 'Espessura ACM (mm)',
      folga: 'Junta entre peças (mm)',
      msgProcessando: 'Processando no servidor SignEng…',
      msgPronto: '✓ {n} triângulos — ajuste e clique Gerar.',
      msgGerado: '✓ Mosaico gerado com {n} peças!',
      msgGerando: 'Gerando o mosaico no SketchUp…',
      sec3d: '4 · 3D COM IA (BETA)', hint3d: 'Gera o objeto 3D inteiro a partir da foto (leva 1–3 min).',
      faces3d: 'Triângulos do 3D', btn3d: 'Gerar 3D com IA', btn3dSu: 'Gerar sólido 3D no SketchUp',
      msg3dProcessando: 'IA gerando o 3D no servidor… isso leva 1–3 min, aguarde.',
      msg3dPronto: '✓ 3D pronto ({n} triângulos) — arraste o preview pra girar.',
      msg3dGerado: '✓ Sólido 3D gerado com {n} faces!',
      'geoart.cancelled': 'Seleção cancelada.',
      'geoart.invalid_ext': 'Use JPG ou PNG.',
      'geoart.too_big': 'Imagem muito grande (máx. 12 MB).',
      'geoart.no_image': 'Carregue uma foto primeiro.',
      'geoart.no_result': 'Clique em Processar primeiro.',
      'geoart.no_result3d': 'Gere o 3D com IA primeiro.',
      'geoart.exception': 'Erro inesperado no plugin.'
    },
    es: {
      titulo: 'Dibujo Geométrico', subtitulo: 'Foto → mosaico low-poly en ACM (cuadro geométrico).',
      secImagem: '1 · IMAGEN', secGeo: '2 · GEOMÉTRICO', secSaida: '3 · SALIDA (ACM)',
      btnCarregar: 'Cargar foto (JPG/PNG)', btnProcessar: 'Procesar (generar el geométrico)',
      btnGerar: 'Generar mosaico 3D',
      pontos: 'Densidad (triángulos)', removerFundo: 'Quitar fondo (color de las esquinas)',
      tol: 'Tolerancia del fondo', largura: 'Ancho final (mm)', espessura: 'Espesor ACM (mm)',
      folga: 'Junta entre piezas (mm)',
      msgProcessando: 'Procesando en el servidor SignEng…',
      msgPronto: '✓ {n} triángulos — ajusta y pulsa Generar.',
      msgGerado: '✓ ¡Mosaico generado con {n} piezas!',
      msgGerando: 'Generando el mosaico en SketchUp…',
      sec3d: '4 · 3D CON IA (BETA)', hint3d: 'Genera el objeto 3D completo desde la foto (tarda 1–3 min).',
      faces3d: 'Triángulos del 3D', btn3d: 'Generar 3D con IA', btn3dSu: 'Generar sólido 3D en SketchUp',
      msg3dProcessando: 'La IA está generando el 3D en el servidor… tarda 1–3 min, espera.',
      msg3dPronto: '✓ 3D listo ({n} triángulos) — arrastra el preview para girar.',
      msg3dGerado: '✓ ¡Sólido 3D generado con {n} caras!',
      'geoart.cancelled': 'Selección cancelada.',
      'geoart.invalid_ext': 'Usa JPG o PNG.',
      'geoart.too_big': 'Imagen muy grande (máx. 12 MB).',
      'geoart.no_image': 'Carga una foto primero.',
      'geoart.no_result': 'Pulsa Procesar primero.',
      'geoart.no_result3d': 'Genera el 3D con IA primero.',
      'geoart.exception': 'Error inesperado en el plugin.'
    },
    en: {
      titulo: 'Geometric Art', subtitulo: 'Photo → low-poly ACM mosaic (geometric wall art).',
      secImagem: '1 · IMAGE', secGeo: '2 · GEOMETRIC', secSaida: '3 · OUTPUT (ACM)',
      btnCarregar: 'Load photo (JPG/PNG)', btnProcessar: 'Process (build the geometric)',
      btnGerar: 'Generate 3D mosaic',
      pontos: 'Density (triangles)', removerFundo: 'Remove background (corner color)',
      tol: 'Background tolerance', largura: 'Final width (mm)', espessura: 'ACM thickness (mm)',
      folga: 'Gap between pieces (mm)',
      msgProcessando: 'Processing on the SignEng server…',
      msgPronto: '✓ {n} triangles — tweak and click Generate.',
      msgGerado: '✓ Mosaic generated with {n} pieces!',
      msgGerando: 'Generating the mosaic in SketchUp…',
      sec3d: '4 · AI 3D (BETA)', hint3d: 'Generates the full 3D object from the photo (takes 1–3 min).',
      faces3d: '3D triangles', btn3d: 'Generate 3D with AI', btn3dSu: 'Generate 3D solid in SketchUp',
      msg3dProcessando: 'AI is generating the 3D on the server… takes 1–3 min, please wait.',
      msg3dPronto: '✓ 3D ready ({n} triangles) — drag the preview to rotate.',
      msg3dGerado: '✓ 3D solid generated with {n} faces!',
      'geoart.cancelled': 'Selection cancelled.',
      'geoart.invalid_ext': 'Use JPG or PNG.',
      'geoart.too_big': 'Image too large (max 12 MB).',
      'geoart.no_image': 'Load a photo first.',
      'geoart.no_result': 'Click Process first.',
      'geoart.no_result3d': 'Generate the AI 3D first.',
      'geoart.exception': 'Unexpected plugin error.'
    }
  },

  t(k) { return (GeoArtUI.dicts[GeoArtUI.lang] || GeoArtUI.dicts.pt)[k] || k; },

  async init() {
    try {
      const ctx = await Bridge.call('geoart_ctx');
      if (ctx && ctx.ok) GeoArtUI.lang = ctx.lang || 'pt';
    } catch (e) { /* segue em pt */ }
    document.querySelectorAll('[data-key]').forEach(el => { el.textContent = GeoArtUI.t(el.dataset.key); });

    const bind = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    bind('ga_btn_carregar', GeoArtUI.carregar);
    bind('ga_btn_processar', GeoArtUI.processar);
    bind('ga_btn_gerar', GeoArtUI.gerar);
    bind('ga_btn_3d', GeoArtUI.processar3D);
    bind('ga_btn_3d_su', GeoArtUI.gerar3DSu);

    const sync = (id, out) => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => { document.getElementById(out).textContent = el.value; });
    };
    sync('ga_pontos', 'ga_pontos_val');
    sync('ga_tol', 'ga_tol_val');
    sync('ga_faces', 'ga_faces_val');

    // preview 3D: arrasta pra girar
    const cv3 = document.getElementById('ga_canvas3d');
    let dragX = null;
    cv3.addEventListener('mousedown', e => { dragX = e.clientX; });
    window.addEventListener('mouseup', () => { dragX = null; });
    window.addEventListener('mousemove', e => {
      if (dragX === null || !GeoArtUI.mesh3d) return;
      GeoArtUI.rot3d += (e.clientX - dragX) * 0.01;
      dragX = e.clientX;
      GeoArtUI.desenhar3D();
    });
    document.getElementById('ga_fundo').addEventListener('change', () => {
      document.getElementById('ga_f_tol').style.opacity = document.getElementById('ga_fundo').checked ? '1' : '0.4';
    });
  },

  setMsg(txt, kind) {
    const el = document.getElementById('ga_msg');
    el.hidden = !txt;
    el.textContent = txt || '';
    el.className = 'ga__msg' + (kind ? ' ga__msg--' + kind : '');
  },

  async carregar() {
    try {
      const r = await Bridge.call('geoart_carregar', {}, 120000);   // openpanel espera o usuário
      if (!r || !r.ok) {
        if (r && r.code !== 'geoart.cancelled') GeoArtUI.setMsg(GeoArtUI.t(r.code) + (r.error ? ' ' + r.error : ''), 'error');
        return;
      }
      GeoArtUI.tris = null;
      GeoArtUI.mesh3d = null;
      document.getElementById('ga_filename').hidden = false;
      document.getElementById('ga_filename').textContent = '✓ ' + r.filename;
      document.getElementById('ga_img').src = r.data_url;
      document.getElementById('ga_img_wrap').hidden = false;
      document.getElementById('ga_mosaic_wrap').hidden = true;
      document.getElementById('ga_btn_processar').disabled = false;
      document.getElementById('ga_btn_gerar').disabled = true;
      document.getElementById('ga_btn_3d').disabled = false;
      document.getElementById('ga_3d_wrap').hidden = true;
      document.getElementById('ga_btn_3d_su').disabled = true;
      document.getElementById('ga_btn_3d_su').hidden = true;
      GeoArtUI.setMsg('', null);
    } catch (e) { GeoArtUI.setMsg('Erro: ' + e.message, 'error'); }
  },

  async processar() {
    const btn = document.getElementById('ga_btn_processar');
    btn.classList.add('is-loading');
    GeoArtUI.setMsg(GeoArtUI.t('msgProcessando'), 'info');
    try {
      const r = await Bridge.call('geoart_processar', {
        pontos: parseInt(document.getElementById('ga_pontos').value, 10),
        remover_fundo: document.getElementById('ga_fundo').checked,
        tol: parseInt(document.getElementById('ga_tol').value, 10)
      });
      if (!r || !r.ok) {
        GeoArtUI.setMsg((r && r.error) || GeoArtUI.t((r && r.code) || 'geoart.exception'), 'error');
        return;
      }
      GeoArtUI.tris = r.tris;
      GeoArtUI.dims = { w: r.w, h: r.h };
      GeoArtUI.desenharPreview();
      document.getElementById('ga_tris_info').textContent = r.n + ' triângulos · ' + r.w + '×' + r.h + ' px';
      document.getElementById('ga_mosaic_wrap').hidden = false;
      document.getElementById('ga_btn_gerar').disabled = false;
      GeoArtUI.setMsg(GeoArtUI.t('msgPronto').replace('{n}', r.n), 'ok');
    } catch (e) {
      GeoArtUI.setMsg('Erro: ' + e.message, 'error');
    } finally {
      btn.classList.remove('is-loading');
    }
  },

  desenharPreview() {
    const cv = document.getElementById('ga_canvas');
    const { w, h } = GeoArtUI.dims;
    const scale = Math.min(2, 820 / w);
    cv.width = Math.round(w * scale);
    cv.height = Math.round(h * scale);
    const g = cv.getContext('2d');
    g.fillStyle = '#fafafa';
    g.fillRect(0, 0, cv.width, cv.height);
    (GeoArtUI.tris || []).forEach(t => {
      g.beginPath();
      g.moveTo(t.p[0][0] * scale, t.p[0][1] * scale);
      g.lineTo(t.p[1][0] * scale, t.p[1][1] * scale);
      g.lineTo(t.p[2][0] * scale, t.p[2][1] * scale);
      g.closePath();
      g.fillStyle = 'rgb(' + t.c.join(',') + ')';
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1;
      g.stroke();
    });
  },

  async gerar() {
    const btn = document.getElementById('ga_btn_gerar');
    btn.classList.add('is-loading');
    GeoArtUI.setMsg(GeoArtUI.t('msgGerando'), 'info');
    try {
      const r = await Bridge.call('geoart_gerar', {
        larg_mm: parseFloat(document.getElementById('ga_larg').value) || 600,
        esp_mm: parseFloat(document.getElementById('ga_esp').value) || 3,
        folga_mm: parseFloat(document.getElementById('ga_folga').value) || 2
      });
      if (r && r.ok) {
        GeoArtUI.setMsg(GeoArtUI.t('msgGerado').replace('{n}', r.n), 'ok');
      } else if (r && r.blocked) {
        GeoArtUI.setMsg((r.error || 'Licença inválida. Faça login no painel do SignEng.') + (r.code ? ' [' + r.code + ']' : ''), 'error');
      } else {
        GeoArtUI.setMsg((r && r.error) || GeoArtUI.t((r && r.code) || 'geoart.exception'), 'error');
      }
    } catch (e) {
      GeoArtUI.setMsg('Erro: ' + e.message, 'error');
    } finally {
      btn.classList.remove('is-loading');
    }
  },

  // ── 3D COM IA ────────────────────────────────────────────────────────────
  async processar3D() {
    const btn = document.getElementById('ga_btn_3d');
    btn.classList.add('is-loading');
    btn.disabled = true;
    GeoArtUI.setMsg(GeoArtUI.t('msg3dProcessando'), 'info');
    try {
      const r = await Bridge.call('geoart_3d_processar', {
        faces: parseInt(document.getElementById('ga_faces').value, 10)
      }, 580000);   // a IA leva 1–3 min (fila da GPU pode somar)
      if (!r || !r.ok) {
        GeoArtUI.setMsg((r && r.error) || GeoArtUI.t((r && r.code) || 'geoart.exception'), 'error');
        return;
      }
      GeoArtUI.mesh3d = { verts: r.verts, faces: r.faces };
      GeoArtUI.desenhar3D();
      document.getElementById('ga_3d_info').textContent = r.nf + ' triângulos · ' + r.nv + ' vértices';
      document.getElementById('ga_3d_wrap').hidden = false;
      const su = document.getElementById('ga_btn_3d_su');
      su.hidden = false;
      su.disabled = false;
      GeoArtUI.setMsg(GeoArtUI.t('msg3dPronto').replace('{n}', r.nf), 'ok');
    } catch (e) {
      GeoArtUI.setMsg('Erro: ' + e.message, 'error');
    } finally {
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  },

  // projeção isométrica simples (gira em Y, tilt fixo, painter's algorithm)
  desenhar3D() {
    const { verts, faces } = GeoArtUI.mesh3d;
    const cv = document.getElementById('ga_canvas3d');
    cv.width = 820;
    cv.height = 620;
    const g = cv.getContext('2d');
    g.fillStyle = '#fafafa';
    g.fillRect(0, 0, cv.width, cv.height);

    const cosR = Math.cos(GeoArtUI.rot3d), sinR = Math.sin(GeoArtUI.rot3d);
    const tilt = 0.35, cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    const proj = verts.map(v => {
      const x = v[0] * cosR + v[2] * sinR;
      const z = -v[0] * sinR + v[2] * cosR;
      const y = v[1] * cosT - z * sinT;
      return [x, y, v[1] * sinT + z * cosT];   // [sx, sy, depth]
    });
    let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    proj.forEach(p => {
      mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]);
      mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]);
    });
    const sc = Math.min(cv.width / (mxx - mnx || 1), cv.height / (mxy - mny || 1)) * 0.88;
    const ox = (cv.width - (mxx - mnx) * sc) / 2 - mnx * sc;
    const oy = (cv.height + (mxy - mny) * sc) / 2 + mny * sc;
    const px = p => [p[0] * sc + ox, oy - p[1] * sc];

    // ordena por profundidade (mais fundo primeiro) + sombreamento por normal
    const ordered = faces.map(f => {
      const a = proj[f[0]], b = proj[f[1]], c = proj[f[2]];
      return { f, d: (a[2] + b[2] + c[2]) / 3 };
    }).sort((u, v) => u.d - v.d);
    ordered.forEach(({ f }) => {
      const [a, b, c] = [verts[f[0]], verts[f[1]], verts[f[2]]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const ln = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) || 1;
      const lum = Math.abs((n[0] * 0.4 + n[1] * 0.8 + n[2] * 0.45) / ln);
      const tone = Math.round(90 + lum * 140);
      const [pa, pb, pc] = [px(proj[f[0]]), px(proj[f[1]]), px(proj[f[2]])];
      g.beginPath();
      g.moveTo(pa[0], pa[1]);
      g.lineTo(pb[0], pb[1]);
      g.lineTo(pc[0], pc[1]);
      g.closePath();
      g.fillStyle = 'rgb(' + tone + ',' + tone + ',' + tone + ')';
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 0.8;
      g.stroke();
    });
  },

  async gerar3DSu() {
    const btn = document.getElementById('ga_btn_3d_su');
    btn.classList.add('is-loading');
    GeoArtUI.setMsg(GeoArtUI.t('msgGerando'), 'info');
    try {
      const r = await Bridge.call('geoart_3d_gerar', {
        larg_mm: parseFloat(document.getElementById('ga_larg').value) || 600
      });
      if (r && r.ok) {
        GeoArtUI.setMsg(GeoArtUI.t('msg3dGerado').replace('{n}', r.n), 'ok');
      } else if (r && r.blocked) {
        GeoArtUI.setMsg((r.error || 'Licença inválida. Faça login no painel do SignEng.') + (r.code ? ' [' + r.code + ']' : ''), 'error');
      } else {
        GeoArtUI.setMsg((r && r.error) || GeoArtUI.t((r && r.code) || 'geoart.exception'), 'error');
      }
    } catch (e) {
      GeoArtUI.setMsg('Erro: ' + e.message, 'error');
    } finally {
      btn.classList.remove('is-loading');
    }
  }
};

document.addEventListener('DOMContentLoaded', GeoArtUI.init);
