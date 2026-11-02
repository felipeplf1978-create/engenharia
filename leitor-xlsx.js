/*
 * Leitor mínimo de arquivos .xlsx (somente leitura), sem dependências externas.
 * Usa a API nativa DecompressionStream (Edge/Chrome 80+).
 *
 * LeitorXlsx.ler(arrayBuffer, nomeDaAba) -> { linhas: [[valor,...],...], modificadoEm: Date|null, abas: [...] }
 *  - números e datas vêm como número (datas = número serial do Excel)
 *  - textos vêm como string; células vazias como null
 */
(function (global) {
  'use strict';

  const dec = new TextDecoder('utf-8');

  async function inflar(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const resposta = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await resposta.arrayBuffer());
  }

  async function lerZip(buffer) {
    const dv = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Arquivo não é um .xlsx válido (ZIP não encontrado).');
    const total = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entradas = {};
    for (let n = 0; n < total; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP corrompido (diretório central).');
      const metodo = dv.getUint16(p + 10, true);
      const tamComp = dv.getUint32(p + 20, true);
      const nomeLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const comLen = dv.getUint16(p + 32, true);
      const offLocal = dv.getUint32(p + 42, true);
      const nome = dec.decode(u8.subarray(p + 46, p + 46 + nomeLen));
      entradas[nome] = { metodo, tamComp, offLocal };
      p += 46 + nomeLen + extraLen + comLen;
    }
    async function ler(nome) {
      const e = entradas[nome];
      if (!e) return null;
      const o = e.offLocal;
      if (dv.getUint32(o, true) !== 0x04034b50) throw new Error('ZIP corrompido (cabeçalho local).');
      const ini = o + 30 + dv.getUint16(o + 26, true) + dv.getUint16(o + 28, true);
      const dados = u8.subarray(ini, ini + e.tamComp);
      const bruto = e.metodo === 0 ? dados : await inflar(dados);
      return dec.decode(bruto);
    }
    return { ler, nomes: Object.keys(entradas) };
  }

  function xml(texto) {
    const d = new DOMParser().parseFromString(texto, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('XML inválido dentro do .xlsx.');
    return d;
  }

  // filhos diretos com um nome local (ignora prefixos de namespace)
  function filhos(no, nome) {
    const r = [];
    for (const c of no.childNodes) if (c.nodeType === 1 && c.localName === nome) r.push(c);
    return r;
  }
  function descendentes(no, nome) {
    return Array.from(no.getElementsByTagNameNS('*', nome));
  }

  function colunaParaIndice(ref) {
    const m = /^([A-Z]+)/.exec(ref);
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function textoSI(si) {
    // concatena <t> de <si> ou de <r>, ignorando fonética (rPh)
    let s = '';
    for (const c of si.childNodes) {
      if (c.nodeType !== 1) continue;
      if (c.localName === 't') s += c.textContent;
      else if (c.localName === 'r') for (const t of filhos(c, 't')) s += t.textContent;
    }
    return s;
  }

  async function ler(buffer, nomeAba) {
    const zip = await lerZip(buffer);

    const wb = xml(await zip.ler('xl/workbook.xml'));
    const abas = descendentes(wb, 'sheet').map(s => ({
      nome: s.getAttribute('name'),
      rid: s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id')
    }));
    const alvo = abas.find(a => a.nome === nomeAba) ||
      abas.find(a => a.nome.trim().toLowerCase() === String(nomeAba).trim().toLowerCase());
    if (!alvo) throw new Error('Aba "' + nomeAba + '" não encontrada. Abas existentes: ' + abas.map(a => a.nome).join(', '));

    const rels = xml(await zip.ler('xl/_rels/workbook.xml.rels'));
    const rel = descendentes(rels, 'Relationship').find(r => r.getAttribute('Id') === alvo.rid);
    if (!rel) throw new Error('Relação da aba não encontrada.');
    let caminho = rel.getAttribute('Target');
    caminho = caminho.startsWith('/') ? caminho.slice(1) : 'xl/' + caminho;

    let compartilhadas = [];
    const ssTxt = await zip.ler('xl/sharedStrings.xml');
    if (ssTxt) compartilhadas = descendentes(xml(ssTxt).documentElement, 'si').map(textoSI);

    const folha = xml(await zip.ler(caminho));
    const linhas = [];
    for (const row of descendentes(folha, 'row')) {
      const idx = parseInt(row.getAttribute('r'), 10) - 1;
      const arr = [];
      for (const c of filhos(row, 'c')) {
        const col = colunaParaIndice(c.getAttribute('r'));
        const t = c.getAttribute('t');
        const v = filhos(c, 'v')[0];
        let val = null;
        if (t === 'inlineStr') {
          const is = filhos(c, 'is')[0];
          val = is ? textoSI(is) : null;
        } else if (v) {
          const bruto = v.textContent;
          if (t === 's') val = compartilhadas[parseInt(bruto, 10)];
          else if (t === 'str') val = bruto;
          else if (t === 'b') val = bruto === '1';
          else if (t === 'e') val = null; // erro de fórmula (#N/A etc.)
          else val = bruto === '' ? null : Number(bruto);
        }
        if (val === '') val = null;
        arr[col] = val === undefined ? null : val;
      }
      for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = null;
      linhas[idx] = arr;
    }
    for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = [];

    let modificadoEm = null;
    try {
      const core = await zip.ler('docProps/core.xml');
      if (core) {
        const m = descendentes(xml(core), 'modified')[0];
        if (m && m.textContent) modificadoEm = new Date(m.textContent);
      }
    } catch (e) { /* opcional */ }

    return { linhas, modificadoEm, abas: abas.map(a => a.nome) };
  }

  global.LeitorXlsx = { ler };
})(window);
