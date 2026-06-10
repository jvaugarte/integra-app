'use client'
import { useState } from 'react'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS = ['L','M','X','J','V','S','D']

function getWeekNum(d: Date) { {
  const jan1 = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
}

function getMondayOfWeek(d) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setDate(m.getDate() + diff)
  return m
}

function fmt(d) {
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export default function SelectorPeriodo({ onChange }) {
  const hoy = new Date()
  const [tipo, setTipo] = useState('dia')
  const [semVista, setSemVista] = useState('dias')
  const [semYear, setSemYear] = useState(hoy.getFullYear())
  const [semMonth, setSemMonth] = useState(hoy.getMonth())
  const [selSemana, setSelSemana] = useState(hoy)
  const [selMes, setSelMes] = useState(hoy.getMonth())
  const [selAnioMes, setSelAnioMes] = useState(hoy.getFullYear())
  const [mesVista, setMesVista] = useState('meses')
  const [selDia, setSelDia] = useState(hoy.toISOString().split('T')[0])
  const [rangoInicio, setRangoInicio] = useState(hoy.toISOString().split('T')[0])
  const [rangoFin, setRangoFin] = useState(hoy.toISOString().split('T')[0])

  function cambiarTipo(t) {
    setTipo(t)
    if (t === 'dia') emitir('dia', hoy.toISOString().split('T')[0], hoy.toISOString().split('T')[0])
    if (t === 'semana') emitirSemana(hoy)
    if (t === 'mes') emitirMes(hoy.getMonth(), hoy.getFullYear())
    if (t === 'rango') emitirRango(rangoInicio, rangoFin)
  }

  function emitir(t, fechaInicio, fechaFin) {
    const d = new Date(fechaInicio + 'T12:00:00')
    onChange({ tipo: t, fecha: fechaInicio, fecha_fin: fechaFin, label: d.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) })
  }

  function emitirSemana(fecha) {
    const mon = getMondayOfWeek(fecha)
    const sun = new Date(mon.getTime() + 6 * 86400000)
    const wn = getWeekNum(mon)
    onChange({ tipo: 'semana', fecha: mon.toISOString().split('T')[0], fecha_fin: sun.toISOString().split('T')[0], label: `Semana ${wn} — ${fmt(mon)} al ${fmt(sun)} ${mon.getFullYear()}` })
  }

  function emitirMes(m, y) {
    const inicio = new Date(y, m, 1)
    const fin = new Date(y, m + 1, 0)
    onChange({ tipo: 'mes', fecha: inicio.toISOString().split('T')[0], fecha_fin: fin.toISOString().split('T')[0], label: `${MESES[m]} ${y}` })
  }

  function emitirRango(inicio, fin) {
    if (!inicio || !fin) return
    onChange({ tipo: 'rango', fecha: inicio, fecha_fin: fin, label: `${fmt(new Date(inicio + 'T12:00:00'))} al ${fmt(new Date(fin + 'T12:00:00'))}` })
  }

  function renderDias() {
    const today = hoy
    const first = new Date(semYear, semMonth, 1)
    const last = new Date(semYear, semMonth + 1, 0)
    let startDay = first.getDay() === 0 ? 6 : first.getDay() - 1
    const selMon = getMondayOfWeek(selSemana)
    const selSun = new Date(selMon.getTime() + 6 * 86400000)
    const rows = []

    rows.push(
      <div key="h" style={{display:'grid',gridTemplateColumns:'24px repeat(7,1fr)',gap:'2px',marginBottom:'4px'}}>
        <div/>
        {DIAS.map(d => <div key={d} style={{textAlign:'center',fontSize:'11px',color:'var(--color-text-tertiary)',fontWeight:'500',padding:'3px 0'}}>{d}</div>)}
      </div>
    )

    let day = 1 - startDay
    for (let row = 0; row < 6; row++) {
      const rowStart = new Date(semYear, semMonth, day)
      if (rowStart > last && row > 3) break
      const cells = [
        <div key="wn" style={{fontSize:'11px',color:'var(--color-text-tertiary)',textAlign:'right',padding:'4px 4px 4px 0',lineHeight:'1'}}>{getWeekNum(rowStart)}</div>
      ]
      for (let col = 0; col < 7; col++) {
        const d = new Date(semYear, semMonth, day)
        const isOther = d.getMonth() !== semMonth
        const isToday = d.toDateString() === today.toDateString()
        const inWeek = d >= selMon && d <= selSun
        const isStart = d.toDateString() === selMon.toDateString()
        const isEnd = d.toDateString() === selSun.toDateString()
        const dy = d.getFullYear(), dm = d.getMonth(), dd = d.getDate()
        cells.push(
          <div key={col} onClick={() => { const f = new Date(dy,dm,dd); setSelSemana(f); emitirSemana(f) }}
            style={{textAlign:'center',fontSize:'12px',padding:'5px 2px',cursor:'pointer',lineHeight:'1',
              background: inWeek ? '#EAF3DE' : 'transparent',
              color: isOther ? 'var(--color-text-tertiary)' : isToday ? 'var(--color-text-primary)' : inWeek ? '#27500A' : 'var(--color-text-secondary)',
              fontWeight: inWeek || isToday ? '500' : '400',
              opacity: isOther ? 0.4 : 1,
              borderRadius: isStart ? '4px 0 0 4px' : isEnd ? '0 4px 4px 0' : inWeek ? '0' : '4px'}}>
            {d.getDate()}
          </div>
        )
        day++
      }
      rows.push(<div key={row} style={{display:'grid',gridTemplateColumns:'24px repeat(7,1fr)',gap:'2px',marginBottom:'2px'}}>{cells}</div>)
    }
    return rows
  }

  const curYear = hoy.getFullYear()
  const anios = Array.from({length: 8}, (_, i) => curYear - 5 + i)
  const selMon = getMondayOfWeek(selSemana)
  const selSun = new Date(selMon.getTime() + 6 * 86400000)

  const btnStyle = (active) => ({
    flex:1, padding:'6px 4px', fontSize:'11px', borderRadius:'8px', border:'0.5px solid', cursor:'pointer', transition:'all .15s',
    background: active ? '#EAF3DE' : 'transparent',
    borderColor: active ? '#C0DD97' : 'var(--color-border-secondary)',
    color: active ? '#27500A' : 'var(--color-text-secondary)',
    fontWeight: active ? '500' : '400'
  })

  const navBtn = {width:'28px',height:'28px',borderRadius:'6px',border:'0.5px solid var(--color-border-secondary)',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--color-text-secondary)',fontSize:'16px',lineHeight:'1'}

  const resultBadge = {marginTop:'10px',background:'#EAF3DE',border:'0.5px solid #C0DD97',borderRadius:'8px',padding:'7px 12px',fontSize:'12px',color:'#27500A',fontWeight:'500',textAlign:'center' as const}

  const inputStyle = {width:'100%',padding:'8px 12px',border:'0.5px solid var(--color-border-secondary)',borderRadius:'8px',fontSize:'13px',color:'var(--color-text-primary)',background:'var(--color-background-primary)'}

  return (
    <div>
      {/* Tipo */}
      <div style={{display:'flex',gap:'4px',marginBottom:'12px'}}>
        {['dia','semana','mes','rango'].map(t => (
          <button key={t} onClick={() => cambiarTipo(t)} style={btnStyle(tipo === t)}>
            {t === 'dia' ? 'Día' : t === 'semana' ? 'Semana' : t === 'mes' ? 'Mes' : 'Rango'}
          </button>
        ))}
      </div>

      {/* DÍA */}
      {tipo === 'dia' && (
        <input type="date" value={selDia}
          onChange={e => { setSelDia(e.target.value); emitir('dia', e.target.value, e.target.value) }}
          style={inputStyle}/>
      )}

      {/* SEMANA */}
      {tipo === 'semana' && (
        <div style={{border:'0.5px solid var(--color-border-tertiary)',borderRadius:'12px',padding:'12px'}}>
          {semVista === 'dias' && <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
              <button onClick={() => { let nm=semMonth-1,ny=semYear; if(nm<0){nm=11;ny--} setSemMonth(nm);setSemYear(ny) }} style={navBtn}>‹</button>
              <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                <button onClick={() => setSemVista('meses')} style={{fontSize:'13px',fontWeight:'500',color:'var(--color-text-primary)',background:'transparent',border:'none',cursor:'pointer',padding:'4px 8px',borderRadius:'6px'}}>
                  {MESES[semMonth].substring(0,3)}
                </button>
                <button onClick={() => setSemVista('anios')} style={{fontSize:'13px',fontWeight:'500',color:'var(--color-text-primary)',background:'transparent',border:'none',cursor:'pointer',padding:'4px 8px',borderRadius:'6px'}}>
                  {semYear}
                </button>
              </div>
              <button onClick={() => { let nm=semMonth+1,ny=semYear; if(nm>11){nm=0;ny++} setSemMonth(nm);setSemYear(ny) }} style={navBtn}>›</button>
            </div>
            {renderDias()}
            <div style={resultBadge}>Semana {getWeekNum(selMon)} — {fmt(selMon)} al {fmt(selSun)} {selMon.getFullYear()}</div>
          </>}

          {semVista === 'meses' && <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
              <button onClick={() => setSemYear(y => y-1)} style={navBtn}>‹</button>
              <button onClick={() => setSemVista('anios')} style={{fontSize:'13px',fontWeight:'500',color:'var(--color-text-primary)',background:'transparent',border:'none',cursor:'pointer',padding:'4px 8px',borderRadius:'6px'}}>{semYear} ▼</button>
              <button onClick={() => setSemYear(y => y+1)} style={navBtn}>›</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'6px'}}>
              {MESES.map((m,i) => (
                <div key={i} onClick={() => { setSemMonth(i); setSemVista('dias') }}
                  style={{padding:'8px',fontSize:'12px',borderRadius:'8px',cursor:'pointer',textAlign:'center',border:'0.5px solid',
                    background: i===semMonth?'#EAF3DE':'transparent', borderColor: i===semMonth?'#C0DD97':'transparent',
                    color: i===semMonth?'#27500A':'var(--color-text-secondary)', fontWeight: i===semMonth?'500':'400'}}>
                  {m.substring(0,3)}
                </div>
              ))}
            </div>
          </>}

          {semVista === 'anios' && <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
              <span style={{fontSize:'13px',fontWeight:'500',color:'var(--color-text-primary)'}}>Selecciona el año</span>
              <button onClick={() => setSemVista('meses')} style={{fontSize:'12px',color:'var(--color-text-secondary)',background:'transparent',border:'none',cursor:'pointer'}}>← Volver</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'6px'}}>
              {anios.map(y => (
                <div key={y} onClick={() => { setSemYear(y); setSemVista('meses') }}
                  style={{padding:'8px 4px',fontSize:'13px',borderRadius:'8px',cursor:'pointer',textAlign:'center',border:'0.5px solid',
                    background: y===semYear?'#EAF3DE':'transparent', borderColor: y===semYear?'#C0DD97':'transparent',
                    color: y===semYear?'#27500A':y===curYear?'var(--color-text-primary)':'var(--color-text-secondary)',
                    fontWeight: y===semYear||y===curYear?'500':'400'}}>
                  {y}
                </div>
              ))}
            </div>
          </>}
        </div>
      )}

      {/* MES */}
      {tipo === 'mes' && (
        <div style={{border:'0.5px solid var(--color-border-tertiary)',borderRadius:'12px',padding:'12px'}}>
          {mesVista === 'meses' && <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
              <button onClick={() => setSelAnioMes(y => y-1)} style={navBtn}>‹</button>
              <button onClick={() => setMesVista('anios')} style={{fontSize:'13px',fontWeight:'500',color:'var(--color-text-primary)',background:'transparent',border:'none',cursor:'pointer',padding:'4px 8px',borderRadius:'6px'}}>{selAnioMes} ▼</button>
              <button onClick={() => setSelAnioMes(y => y+1)} style={navBtn}>›</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'6px'}}>
              {MESES.map((m,i) => (
                <div key={i} onClick={() => { setSelMes(i); emitirMes(i, selAnioMes) }}
                  style={{padding:'8px',fontSize:'12px',borderRadius:'8px',cursor:'pointer',textAlign:'center',border:'0.5px solid',
                    background: i===selMes?'#EAF3DE':'transparent', borderColor: i===selMes?'#C0DD97':'transparent',
                    color: i===selMes?'#27500A':'var(--color-text-secondary)', fontWeight: i===selMes?'500':'400'}}>
                  {m.substring(0,3)}
                </div>
              ))}
            </div>
            <div style={resultBadge}>{MESES[selMes]} {selAnioMes}</div>
          </>}

          {mesVista === 'anios' && <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
              <span style={{fontSize:'13px',fontWeight:'500',color:'var(--color-text-primary)'}}>Selecciona el año</span>
              <button onClick={() => setMesVista('meses')} style={{fontSize:'12px',color:'var(--color-text-secondary)',background:'transparent',border:'none',cursor:'pointer'}}>← Volver</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'6px'}}>
              {anios.map(y => (
                <div key={y} onClick={() => { setSelAnioMes(y); setMesVista('meses') }}
                  style={{padding:'8px 4px',fontSize:'13px',borderRadius:'8px',cursor:'pointer',textAlign:'center',border:'0.5px solid',
                    background: y===selAnioMes?'#EAF3DE':'transparent', borderColor: y===selAnioMes?'#C0DD97':'transparent',
                    color: y===selAnioMes?'#27500A':y===curYear?'var(--color-text-primary)':'var(--color-text-secondary)',
                    fontWeight: y===selAnioMes||y===curYear?'500':'400'}}>
                  {y}
                </div>
              ))}
            </div>
          </>}
        </div>
      )}

      {/* RANGO */}
      {tipo === 'rango' && (
        <div style={{border:'0.5px solid var(--color-border-tertiary)',borderRadius:'12px',padding:'12px',display:'flex',flexDirection:'column',gap:'10px'}}>
          <div>
            <label style={{fontSize:'12px',color:'var(--color-text-secondary)',display:'block',marginBottom:'4px'}}>Fecha inicial</label>
            <input type="date" value={rangoInicio}
              onChange={e => { setRangoInicio(e.target.value); emitirRango(e.target.value, rangoFin) }}
              style={inputStyle}/>
          </div>
          <div>
            <label style={{fontSize:'12px',color:'var(--color-text-secondary)',display:'block',marginBottom:'4px'}}>Fecha final</label>
            <input type="date" value={rangoFin} min={rangoInicio}
              onChange={e => { setRangoFin(e.target.value); emitirRango(rangoInicio, e.target.value) }}
              style={inputStyle}/>
          </div>
          {rangoInicio && rangoFin && (
            <div style={resultBadge}>
              {fmt(new Date(rangoInicio + 'T12:00:00'))} al {fmt(new Date(rangoFin + 'T12:00:00'))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}