// experiments/lib/3mf-parser.js
// Self-contained 3MF parser. No external deps.
// Returns a NormalizedScene (see plan doc) suitable for both 3mf-viewer.html
// and 3mf-multicolor-viewer.html.
(function () {
  'use strict';

  /* ===================== ZIP ===================== */
  // Parses a ZIP archive in memory and returns { [path]: { data, compressed } }
  // where `data` is a Uint8Array of the raw (still-compressed if `compressed`)
  // bytes and `compressed` is true for deflate-compressed entries.
  async function parseZip(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const td = new TextDecoder('utf-8');

    // Find End of Central Directory (EOCD) - signature PK\x05\x06
    let eocdOffset = -1;
    for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
    }
    if (eocdOffset < 0) throw new Error('Not a ZIP archive (no EOCD found).');

    let entryCount = view.getUint16(eocdOffset + 10, true);
    let cdSize     = view.getUint32(eocdOffset + 12, true);
    let cdOffset   = view.getUint32(eocdOffset + 16, true);

    // ZIP64 fallback: if any of these is 0xFFFFFFFF, walk from start.
    if (cdOffset === 0xFFFFFFFF || cdSize === 0xFFFFFFFF || entryCount === 0xFFFF) {
      return parseZipLinear(view, bytes, td);
    }

    const files = {};
    let p = cdOffset;
    for (let i = 0; i < entryCount; i++) {
      if (view.getUint32(p, true) !== 0x02014b50) break; // central dir header sig
      const method  = view.getUint16(p + 10, true);
      const compSize = view.getUint32(p + 20, true);
      const nameLen  = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localHdr = view.getUint32(p + 42, true);
      const name = td.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      // Skip to local header to find true file data offset
      const lhNameLen = view.getUint16(localHdr + 26, true);
      const lhExtraLen = view.getUint16(localHdr + 28, true);
      const dataOffset = localHdr + 30 + lhNameLen + lhExtraLen;
      files[name] = {
        data: bytes.subarray(dataOffset, dataOffset + compSize),
        compressed: method === 8,
      };
      p += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  // Linear scan over local file headers — used for ZIP64 archives.
  function parseZipLinear(view, bytes, td) {
    const files = {};
    let p = 0;
    while (p < view.byteLength - 4) {
      const sig = view.getUint32(p, true);
      if (sig !== 0x04034b50) break;
      const method  = view.getUint16(p + 8, true);
      const compSize = view.getUint32(p + 18, true);
      const nameLen  = view.getUint16(p + 26, true);
      const extraLen = view.getUint16(p + 28, true);
      const name = td.decode(bytes.subarray(p + 30, p + 30 + nameLen));
      const dataOffset = p + 30 + nameLen + extraLen;
      files[name] = {
        data: bytes.subarray(dataOffset, dataOffset + compSize),
        compressed: method === 8,
      };
      p = dataOffset + compSize;
    }
    return files;
  }

  async function inflate(entry) {
    if (!entry.compressed) return entry.data;
    const ds = new DecompressionStream('deflate-raw');
    const blob = new Blob([entry.data]);
    const stream = blob.stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }

  /* ===================== XML / MESH ===================== */
  // 3MF transforms are stored as 4×3 row-major (12 floats: 3 rows of a 4×4
  // missing the [0,0,0,1] bottom row, BUT 3MF spec uses *column-major* 4×3
  // where the 3 cols are the basis vectors and the 4th col is the translation.
  // See: 3MF Core Spec §3.3. Convert to column-major 4×4.
  function parse3MFTransform(str) {
    if (!str) return identity4x4();
    const v = str.trim().split(/\s+/).map(parseFloat);
    if (v.length !== 12 || v.some(Number.isNaN)) return identity4x4();
    // 3MF: m00 m01 m02  m10 m11 m12  m20 m21 m22  m30 m31 m32
    //  → basis columns are (m00,m01,m02), (m10,m11,m12), (m20,m21,m22);
    //    translation is (m30,m31,m32). Stored column-major in our 16-float buf.
    return new Float32Array([
      v[0], v[1], v[2], 0,
      v[3], v[4], v[5], 0,
      v[6], v[7], v[8], 0,
      v[9], v[10], v[11], 1,
    ]);
  }
  function identity4x4() {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  }
  function mat4Mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k*4 + r] * b[c*4 + k];
      o[c*4 + r] = s;
    }
    return o;
  }
  function transformPoint(m, x, y, z) {
    return [
      m[0]*x + m[4]*y + m[8]*z  + m[12],
      m[1]*x + m[5]*y + m[9]*z  + m[13],
      m[2]*x + m[6]*y + m[10]*z + m[14],
    ];
  }

  function extractMesh(meshEl) {
    const verts = [], tris = [];
    for (const v of meshEl.getElementsByTagNameNS('*', 'vertex')) {
      verts.push(+v.getAttribute('x') || 0, +v.getAttribute('y') || 0, +v.getAttribute('z') || 0);
    }
    for (const t of meshEl.getElementsByTagNameNS('*', 'triangle')) {
      tris.push(+t.getAttribute('v1') || 0, +t.getAttribute('v2') || 0, +t.getAttribute('v3') || 0);
    }
    if (!verts.length || !tris.length) return null;
    return { vertices: new Float32Array(verts), triangles: new Uint32Array(tris) };
  }

  // Resolve a component path. 3MF stores paths absolute from the archive root
  // ("/3D/Objects/object_109.model"). Strip leading slash to match our zipFiles keys.
  function normalizePath(p, base) {
    if (!p) return base;
    if (p.startsWith('/')) return p.slice(1);
    // Relative — resolve against base file directory
    const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
    return dir + p;
  }

  // Parse one .model XML into { rootMetadata, unit, objects: Map<id, {mesh, components}>, buildItems: [{objectId, transform}] }
  function parseModelXML(xmlText, ownPath) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error(`Invalid XML in ${ownPath}`);
    }
    const root = doc.documentElement;
    const unit = root.getAttribute('unit') || 'millimeter';

    const rootMetadata = {};
    for (const child of root.children) {
      if (child.localName !== 'metadata') continue;
      const n = child.getAttribute('name'), v = child.textContent.trim();
      if (n && v) rootMetadata[n] = v;
    }

    const objects = new Map();
    for (const obj of root.getElementsByTagNameNS('*', 'object')) {
      const id = obj.getAttribute('id');
      if (!id) continue;
      const nameAttr = obj.getAttribute('name') || obj.getAttribute('partname') || '';
      const directMeshes = [...obj.children].filter(c => c.localName === 'mesh');
      let mesh = null;
      if (directMeshes.length) {
        // Combine multiple direct meshes (rare, but valid) into one part.
        const vAll = [], tAll = [];
        for (const m of directMeshes) {
          const em = extractMesh(m);
          if (!em) continue;
          const off = vAll.length / 3;
          for (const v of em.vertices) vAll.push(v);
          for (const t of em.triangles) tAll.push(t + off);
        }
        if (vAll.length) mesh = { vertices: new Float32Array(vAll), triangles: new Uint32Array(tAll) };
      }
      const components = [];
      for (const comp of obj.getElementsByTagNameNS('*', 'component')) {
        const targetId = comp.getAttribute('objectid');
        if (!targetId) continue;
        const pPath = comp.getAttributeNS('http://schemas.microsoft.com/3dmanufacturing/production/2015/06', 'path')
                   || comp.getAttribute('p:path') // some files don't declare the namespace
                   || null;
        components.push({
          targetPath: pPath ? normalizePath(pPath, ownPath) : ownPath,
          targetId,
          transform: parse3MFTransform(comp.getAttribute('transform')),
        });
      }
      objects.set(id, { id, name: nameAttr, mesh, components });
    }

    const buildItems = [];
    const buildEl = root.getElementsByTagNameNS('*', 'build')[0];
    if (buildEl) {
      for (const item of buildEl.getElementsByTagNameNS('*', 'item')) {
        const objectId = item.getAttribute('objectid');
        if (!objectId) continue;
        buildItems.push({
          objectId,
          transform: parse3MFTransform(item.getAttribute('transform')),
        });
      }
    }

    return { unit, rootMetadata, objects, buildItems };
  }

  /* ===================== COMPONENT RESOLUTION ===================== */
  // Walk one object's graph; emit { meshObjectId, vertices, triangles } leaves
  // with the cumulative transform applied to vertex positions.
  function resolveObjectToParts(objectId, sourcePath, cumulativeXform, modelIndex, out) {
    const file = modelIndex.get(sourcePath);
    if (!file) return; // missing component file — silently skip
    const obj = file.objects.get(objectId);
    if (!obj) return;

    // If this object has a mesh, emit it as a part (transformed).
    if (obj.mesh) {
      const v = obj.mesh.vertices;
      const out3 = new Float32Array(v.length);
      for (let i = 0; i < v.length; i += 3) {
        const p = transformPoint(cumulativeXform, v[i], v[i+1], v[i+2]);
        out3[i] = p[0]; out3[i+1] = p[1]; out3[i+2] = p[2];
      }
      out.push({
        meshObjectId: obj.id,
        meshObjectName: obj.name,
        sourcePath,
        vertices: out3,
        triangles: obj.mesh.triangles, // share buffer — never mutated by renderer
      });
    }

    // Recurse into components, composing transforms.
    for (const c of obj.components) {
      const composed = mat4Mul(cumulativeXform, c.transform);
      resolveObjectToParts(c.targetId, c.targetPath, composed, modelIndex, out);
    }
  }

  /* ===================== MODEL_SETTINGS.CONFIG ===================== */
  function parseModelSettings(xmlText) {
    if (!xmlText) return { objects: new Map(), plates: [] };
    let doc;
    try { doc = new DOMParser().parseFromString(xmlText, 'application/xml'); }
    catch { return { objects: new Map(), plates: [] }; }
    if (doc.querySelector('parsererror')) return { objects: new Map(), plates: [] };

    const getMeta = (el, key) => {
      for (const m of el.children) {
        if (m.localName === 'metadata' && m.getAttribute('key') === key) {
          return m.getAttribute('value');
        }
      }
      return null;
    };

    const objects = new Map();
    for (const obj of doc.documentElement.children) {
      if (obj.localName !== 'object') continue;
      const id = obj.getAttribute('id');
      if (!id) continue;
      const name = getMeta(obj, 'name') || '';
      const parts = new Map();
      for (const p of obj.children) {
        if (p.localName !== 'part') continue;
        const pid = p.getAttribute('id');
        if (!pid) continue;
        const pname = getMeta(p, 'name') || '';
        const extruder = getMeta(p, 'extruder');
        parts.set(pid, {
          name: pname,
          extruder: extruder ? parseInt(extruder, 10) : null,
        });
      }
      objects.set(id, { name, parts });
    }

    const plates = [];
    for (const pl of doc.documentElement.children) {
      if (pl.localName !== 'plate') continue;
      const id = parseInt(getMeta(pl, 'plater_id') || '0', 10) || (plates.length + 1);
      const name = getMeta(pl, 'plater_name') || `Plate ${id}`;
      const objectIds = [];
      for (const mi of pl.children) {
        if (mi.localName !== 'model_instance') continue;
        const oid = getMeta(mi, 'object_id');
        if (oid) objectIds.push(oid);
      }
      plates.push({ id, name, objectIds });
    }

    return { objects, plates };
  }

  /* ===================== TOP-LEVEL parseScene ===================== */
  async function parseScene(arrayBuffer) {
    const zipFiles = await parseZip(arrayBuffer);

    // Root model — 3MF spec requires it at "3D/3dmodel.model"; some archives lowercase.
    const rootKey = Object.keys(zipFiles).find(k => /^3d\/3dmodel\.model$/i.test(k));
    if (!rootKey) {
      const listing = Object.keys(zipFiles).slice(0, 12).join(', ');
      throw new Error(`No 3D/3dmodel.model found. Archive contains: ${listing}`);
    }

    // Decode all .model files in parallel; build path → parsed-doc index.
    const modelKeys = Object.keys(zipFiles).filter(k => k.toLowerCase().endsWith('.model'));
    const td = new TextDecoder();
    const modelIndex = new Map();
    await Promise.all(modelKeys.map(async (k) => {
      let bytes;
      try { bytes = await inflate(zipFiles[k]); } catch { return; }
      try {
        const parsed = parseModelXML(td.decode(bytes), k);
        modelIndex.set(k, parsed);
      } catch (e) {
        console.warn(`Failed to parse ${k}:`, e.message);
      }
    }));

    const root = modelIndex.get(rootKey);
    if (!root) throw new Error('Root 3dmodel.model failed to parse.');

    // Optional Bambu settings.
    const settingsKey = Object.keys(zipFiles).find(k => /metadata\/model_settings\.config$/i.test(k));
    let settings = { objects: new Map(), plates: [] };
    if (settingsKey) {
      try {
        const bytes = await inflate(zipFiles[settingsKey]);
        settings = parseModelSettings(td.decode(bytes));
      } catch (e) { console.warn('Failed to parse model_settings.config:', e.message); }
    }

    // Build one instance per <build><item>.
    const instances = root.buildItems.map((bi) => {
      const leaves = [];
      resolveObjectToParts(bi.objectId, rootKey, bi.transform, modelIndex, leaves);

      // Each leaf is one rendered part. Friendly names + extruder come from
      // settings.objects.get(bi.objectId).parts, keyed by leaf order if present,
      // otherwise by the leaf's own meshObjectName. Bambu's part IDs in
      // model_settings.config typically match leaf order within the top-level object.
      const settingObj = settings.objects.get(bi.objectId);
      const settingParts = settingObj ? [...settingObj.parts.values()] : [];

      const parts = leaves.map((leaf, idx) => {
        const sp = settingParts[idx] || null;
        const name = (sp && sp.name) || leaf.meshObjectName || `Part ${leaf.meshObjectId}`;
        const extruder = sp ? sp.extruder : null;
        return {
          name,
          extruder,
          vertices: leaf.vertices,
          triangles: leaf.triangles,
        };
      });

      return {
        objectId: bi.objectId,
        objectName: (settingObj && settingObj.name) || `Object ${bi.objectId}`,
        parts,
      };
    });

    // Group instances into plates. If settings has plates, use them; otherwise one plate.
    let plates;
    if (settings.plates.length) {
      plates = settings.plates.map((pl) => ({
        id: pl.id,
        name: pl.name,
        instances: instances.filter(inst => pl.objectIds.includes(inst.objectId)),
      })).filter(p => p.instances.length); // drop empty plates
      // Any instance not claimed by a plate goes into a synthetic trailing plate.
      const claimed = new Set(settings.plates.flatMap(p => p.objectIds));
      const orphans = instances.filter(inst => !claimed.has(inst.objectId));
      if (orphans.length) plates.push({
        id: (plates.at(-1)?.id || 0) + 1,
        name: 'Unassigned',
        instances: orphans,
      });
      if (!plates.length) plates = [{ id: 1, name: 'Plate 1', instances }];
    } else {
      plates = [{ id: 1, name: 'Plate 1', instances }];
    }

    return {
      filename: '',
      unit: root.unit,
      metadata: root.rootMetadata,
      plates,
    };
  }

  window.Scene3MF = { parseScene };
})();
