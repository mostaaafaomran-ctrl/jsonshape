(function (root) {
  function pascal(s) {
    var p = String(s).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
      .map(function (w) { return w[0].toUpperCase() + w.slice(1); }).join('');
    if (!p) p = 'Item';
    if (/^[0-9]/.test(p)) p = '_' + p;
    return p;
  }
  function singular(s) {
    if (/ies$/i.test(s)) return s.replace(/ies$/i, 'y');
    if (/(s|x|ch|sh)es$/i.test(s)) return s.replace(/es$/i, '');
    if (/s$/i.test(s) && !/ss$/i.test(s)) return s.replace(/s$/i, '');
    return s;
  }
  function isId(k) { return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k); }
  function key(k) { return isId(k) ? k : JSON.stringify(k); }
  // shape: {k:'string'|'number'|'boolean'|'null'|'unknown'|'array'|'object'|'union', ...}
  function infer(v) {
    if (v === null) return { k: 'null' };
    if (Array.isArray(v)) {
      var el = v.length ? v.map(infer).reduce(merge) : { k: 'unknown' };
      return { k: 'array', el: el };
    }
    switch (typeof v) {
      case 'string': return { k: 'string' };
      case 'number': return { k: 'number' };
      case 'boolean': return { k: 'boolean' };
      case 'object':
        var f = {}, n = 1;
        Object.keys(v).forEach(function (x) { f[x] = { t: infer(v[x]), opt: false }; });
        return { k: 'object', f: f, n: n };
    }
    return { k: 'unknown' };
  }
  function members(s) { return s.k === 'union' ? s.m : [s]; }
  function merge(a, b) {
    if (a.k === 'object' && b.k === 'object') {
      var f = {}, seen = {};
      Object.keys(a.f).forEach(function (x) {
        seen[x] = 1;
        if (b.f[x]) f[x] = { t: merge(a.f[x].t, b.f[x].t), opt: a.f[x].opt || b.f[x].opt };
        else f[x] = { t: a.f[x].t, opt: true };
      });
      Object.keys(b.f).forEach(function (x) {
        if (!seen[x]) f[x] = { t: b.f[x].t, opt: true };
      });
      return { k: 'object', f: f };
    }
    if (a.k === 'array' && b.k === 'array') {
      if (a.el.k === 'unknown') return b;
      if (b.el.k === 'unknown') return a;
      return { k: 'array', el: merge(a.el, b.el) };
    }
    if (a.k === b.k && a.k !== 'union') return a;
    var out = [];
    members(a).concat(members(b)).forEach(function (m) {
      for (var i = 0; i < out.length; i++) {
        if (out[i].k === m.k) { out[i] = merge(out[i], m); return; }
      }
      out.push(m);
    });
    return out.length === 1 ? out[0] : { k: 'union', m: out };
  }

  function generate(json, opts) {
    opts = opts || {};
    var root = pascal(opts.name || 'Root');
    var style = opts.style || 'interface'; // interface | type
    var zod = opts.format === 'zod';
    var exp = opts.exportAll !== false ? 'export ' : '';
    var shape = infer(typeof json === 'string' ? JSON.parse(json) : json);
    var decls = [], names = {};
    function uniq(n) {
      var base = n, i = 2;
      while (names[n]) n = base + i++;
      names[n] = 1; return n;
    }
    function ref(s, hint) {
      switch (s.k) {
        case 'string': return zod ? 'z.string()' : 'string';
        case 'number': return zod ? 'z.number()' : 'number';
        case 'boolean': return zod ? 'z.boolean()' : 'boolean';
        case 'null': return zod ? 'z.null()' : 'null';
        case 'unknown': return zod ? 'z.unknown()' : 'unknown';
        case 'array':
          var inner = ref(s.el, singular(hint));
          if (zod) return inner + '.array()';
          return /[|&]/.test(inner) ? '(' + inner + ')[]' : inner + '[]';
        case 'union':
          var parts = s.m.map(function (m) { return ref(m, hint); });
          return zod ? 'z.union([' + parts.join(', ') + '])' : parts.join(' | ');
        case 'object':
          var n = uniq(pascal(hint));
          decl(n, s);
          return zod ? n + 'Schema' : n;
      }
    }
    function decl(n, s) {
      var keys = Object.keys(s.f);
      if (zod) {
        var body = keys.map(function (k) {
          var r = ref(s.f[k].t, k);
          return '  ' + key(k) + ': ' + r + (s.f[k].opt ? '.optional()' : '') + ',';
        });
        var d = exp + 'const ' + n + 'Schema = z.object({' + (body.length ? '\n' + body.join('\n') + '\n' : '') + '});\n' +
          exp + 'type ' + n + ' = z.infer<typeof ' + n + 'Schema>;';
        decls.push(d);
      } else {
        var lines = keys.map(function (k) {
          return '  ' + key(k) + (s.f[k].opt ? '?' : '') + ': ' + ref(s.f[k].t, k) + ';';
        });
        var inner = (lines.length ? '\n' + lines.join('\n') + '\n' : '');
        decls.push(style === 'type' ? exp + 'type ' + n + ' = {' + inner + '};'
                                    : exp + 'interface ' + n + ' {' + inner + '}');
      }
    }
    var out;
    if (shape.k === 'object') {
      names[root] = 1; decl(root, shape);
    } else {
      var r = ref(shape, root);
      decls.push(zod ? exp + 'const ' + root + 'Schema = ' + r + ';\n' + exp + 'type ' + root + ' = z.infer<typeof ' + root + 'Schema>;'
                     : exp + 'type ' + root + ' = ' + r + ';');
    }
    // dependencies first for zod (const ordering)

    out = decls.join('\n\n') + '\n';
    if (zod) out = "import { z } from 'zod';\n\n" + out;
    else out = decls.slice().reverse().join('\n\n') + '\n';
    return out;
  }
  var api = { generate: generate, infer: infer };
  if (typeof module !== 'undefined') module.exports = api; else root.JSONShape = api;
})(this);
