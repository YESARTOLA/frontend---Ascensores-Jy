import { useEffect, useRef, useState } from 'react';
import { useToast } from '../common/Toast.jsx';
import { checklistPlantillasService } from '../../services/checklistPlantillas.js';

const CATEGORIAS = [
  { codigo: 'mantenimiento', etiqueta: 'Mantenimiento' },
  { codigo: 'correctivo',    etiqueta: 'Correctivo' },
  { codigo: 'emergencia',    etiqueta: 'Emergencia' }
];

const itemVacio = () => ({ grupo: '', texto: '', orden: 0 });

export default function ChecklistPlantillasPanel() {
  const toast = useToast();
  const [categoria, setCategoria] = useState('mantenimiento');
  const [plantilla, setPlantilla] = useState(null);
  const [items, setItems] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [activa, setActiva] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

  const cargar = (cat) => {
    setCargando(true);
    checklistPlantillasService.get(cat)
      .then(p => {
        setPlantilla(p);
        setTitulo(p?.titulo || `Checklist · ${cat}`);
        setDescripcion(p?.descripcion || '');
        setActiva(p?.activa !== 0);
        setItems((p?.items || []).map(it => ({ grupo: it.grupo || '', texto: it.texto, orden: it.orden })));
      })
      .catch(() => {
        setPlantilla(null);
        setItems([]);
      })
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(categoria); }, [categoria]);

  const agregarItem = () => setItems(arr => [...arr, itemVacio()]);
  const cambiarItem = (idx, key, val) => setItems(arr => arr.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  const quitarItem = (idx) => setItems(arr => arr.filter((_, i) => i !== idx));
  const subir = (idx) => setItems(arr => {
    if (idx === 0) return arr;
    const copia = arr.slice();
    [copia[idx - 1], copia[idx]] = [copia[idx], copia[idx - 1]];
    return copia;
  });
  const bajar = (idx) => setItems(arr => {
    if (idx === arr.length - 1) return arr;
    const copia = arr.slice();
    [copia[idx + 1], copia[idx]] = [copia[idx], copia[idx + 1]];
    return copia;
  });

  const guardar = async () => {
    if (guardandoRef.current) return;
    const itemsLimpios = items
      .filter(it => it.texto?.trim())
      .map((it, i) => ({
        grupo: it.grupo?.trim() || null,
        texto: it.texto.trim(),
        orden: i + 1
      }));
    if (itemsLimpios.length === 0) {
      toast.error('Agregue al menos un ítem al checklist');
      return;
    }
    guardandoRef.current = true;
    setGuardando(true);
    try {
      const p = await checklistPlantillasService.guardar(categoria, {
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        activa,
        items: itemsLimpios
      });
      setPlantilla(p);
      toast.success('Plantilla guardada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {CATEGORIAS.map(c => (
          <button
            key={c.codigo}
            type="button"
            onClick={() => setCategoria(c.codigo)}
            className={categoria === c.codigo ? 'btn-primary' : 'btn-secondary'}
          >
            {c.etiqueta}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="label">Título de la plantilla</label>
          <input className="input" value={titulo} onChange={e => setTitulo(e.target.value)} />
        </div>
        <div className="flex items-end gap-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activa} onChange={e => setActiva(e.target.checked)} />
            Plantilla activa
          </label>
        </div>
        <div className="sm:col-span-3">
          <label className="label">Descripción (opcional)</label>
          <textarea className="textarea" rows="2" value={descripcion} onChange={e => setDescripcion(e.target.value)} />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-700">
            Ítems del checklist
            <span className="ml-2 text-xs font-normal text-slate-500">({items.length})</span>
          </h4>
          <button type="button" onClick={agregarItem} className="btn-ghost text-xs !py-1.5 !px-3">+ Agregar ítem</button>
        </div>
        {cargando ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Sin ítems. Use "Agregar ítem" para comenzar. Los técnicos no podrán finalizar servicios de esta categoría hasta que configures al menos uno.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it, idx) => (
              <li key={idx} className="grid grid-cols-12 gap-2 items-start bg-white rounded-md ring-1 ring-slate-200 px-2.5 py-2">
                <div className="col-span-12 sm:col-span-3">
                  <input className="input !py-1.5 text-sm" placeholder="Grupo (opcional, ej. Eléctrico)"
                    value={it.grupo} onChange={e => cambiarItem(idx, 'grupo', e.target.value)} />
                </div>
                <div className="col-span-9 sm:col-span-7">
                  <input className="input !py-1.5 text-sm" placeholder="Texto del ítem a revisar"
                    value={it.texto} onChange={e => cambiarItem(idx, 'texto', e.target.value)} />
                </div>
                <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-1 text-slate-500">
                  <button type="button" title="Subir" onClick={() => subir(idx)} disabled={idx === 0}
                    className="px-1.5 py-0.5 rounded hover:bg-slate-100 disabled:opacity-30">↑</button>
                  <button type="button" title="Bajar" onClick={() => bajar(idx)} disabled={idx === items.length - 1}
                    className="px-1.5 py-0.5 rounded hover:bg-slate-100 disabled:opacity-30">↓</button>
                  <button type="button" title="Quitar" onClick={() => quitarItem(idx)}
                    className="text-red-600 hover:underline text-xs ml-1">Quitar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={guardar} disabled={guardando} className="btn-primary">
          {guardando ? 'Guardando…' : 'Guardar plantilla'}
        </button>
      </div>
    </div>
  );
}
