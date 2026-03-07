'use client'
import { useEffect, useRef, useState } from 'react'

interface Props { onEnter: () => void }

// ── Race data ────────────────────────────────────────────────
const AUS_RACE = new Date('2026-03-08T05:00:00Z')
const CHN_RACE = new Date('2026-03-15T07:00:00Z')
const NOW      = Date.now()

const CURRENT = NOW < AUS_RACE.getTime() ? {
  name: 'AUSTRALIAN GRAND PRIX', nameA: 'AUSTRALIAN', nameB: 'GRAND PRIX',
  round: '01', circuit: 'ALBERT PARK CIRCUIT', city: 'Melbourne, Australia',
  raceUTC: AUS_RACE,
  label: 'THIS WEEKEND',
  sessions: [
    { n:'FP1',        et:'THU 5 MAR · 8:30 PM ET',    utc: new Date('2026-03-06T01:30:00Z') },
    { n:'FP2',        et:'FRI 6 MAR · 12:00 AM ET',   utc: new Date('2026-03-06T05:00:00Z') },
    { n:'QUALIFYING', et:'SAT 7 MAR · 12:00 AM ET',   utc: new Date('2026-03-07T05:00:00Z') },
    { n:'RACE',       et:'SUN 8 MAR · 12:00 AM ET',   utc: new Date('2026-03-08T05:00:00Z') },
  ],
} : {
  name: 'CHINESE GRAND PRIX', nameA: 'CHINESE', nameB: 'GRAND PRIX',
  round: '02', circuit: "SHANGHAI INT'L CIRCUIT", city: 'Shanghai, China',
  raceUTC: CHN_RACE,
  label: 'ROUND 02',
  sessions: [
    { n:'FP1',        et:'FRI 13 MAR · 10:30 PM ET',  utc: new Date('2026-03-13T03:30:00Z') },
    { n:'FP2',        et:'SAT 14 MAR · 2:00 AM ET',   utc: new Date('2026-03-13T07:00:00Z') },
    { n:'QUALIFYING', et:'SAT 14 MAR · 3:00 AM ET',   utc: new Date('2026-03-14T07:00:00Z') },
    { n:'RACE',       et:'SUN 15 MAR · 3:00 AM ET',   utc: new Date('2026-03-15T07:00:00Z') },
  ],
}

const CIRCUITS = [
  { rd:'01', name:'ALBERT PARK',  country:'Australia',     dates:'6–8 MAR',        et:'12:00 AM ET' },
  { rd:'02', name:'SHANGHAI',     country:'China',         dates:'13–15 MAR',      et:'3:00 AM ET'  },
  { rd:'03', name:'SUZUKA',       country:'Japan',         dates:'27–29 MAR',      et:'1:00 AM ET'  },
  { rd:'04', name:'SAKHIR',       country:'Bahrain',       dates:'10–12 APR',      et:'11:00 AM ET' },
  { rd:'05', name:'JEDDAH',       country:'Saudi Arabia',  dates:'17–19 APR',      et:'1:00 PM ET'  },
  { rd:'06', name:'MIAMI',        country:'USA',           dates:'1–3 MAY',        et:'4:00 PM ET'  },
  { rd:'07', name:'MONTREAL',     country:'Canada',        dates:'22–24 MAY',      et:'2:00 PM ET'  },
  { rd:'08', name:'MONACO',       country:'Monaco',        dates:'5–7 JUN',        et:'9:00 AM ET'  },
  { rd:'09', name:'BARCELONA',    country:'Spain',         dates:'12–14 JUN',      et:'9:00 AM ET'  },
  { rd:'10', name:'SPIELBERG',    country:'Austria',       dates:'26–28 JUN',      et:'9:00 AM ET'  },
  { rd:'11', name:'SILVERSTONE',  country:'Great Britain', dates:'3–5 JUL',        et:'10:00 AM ET' },
  { rd:'12', name:'SPA',          country:'Belgium',       dates:'17–19 JUL',      et:'9:00 AM ET'  },
  { rd:'13', name:'BUDAPEST',     country:'Hungary',       dates:'24–26 JUL',      et:'9:00 AM ET'  },
  { rd:'14', name:'ZANDVOORT',    country:'Netherlands',   dates:'21–23 AUG',      et:'9:00 AM ET'  },
  { rd:'15', name:'MONZA',        country:'Italy',         dates:'4–6 SEP',        et:'9:00 AM ET'  },
  { rd:'16', name:'MADRID',       country:'Spain',         dates:'11–13 SEP',      et:'9:00 AM ET'  },
  { rd:'17', name:'BAKU',         country:'Azerbaijan',    dates:'24–26 SEP',      et:'7:00 AM ET'  },
  { rd:'18', name:'SINGAPORE',    country:'Singapore',     dates:'9–11 OCT',       et:'8:00 AM ET'  },
  { rd:'19', name:'AUSTIN',       country:'USA',           dates:'23–25 OCT',      et:'2:00 PM ET'  },
  { rd:'20', name:'MEXICO CITY',  country:'Mexico',        dates:'30 OCT–1 NOV',   et:'2:00 PM ET'  },
  { rd:'21', name:'INTERLAGOS',   country:'Brazil',        dates:'6–8 NOV',        et:'11:00 AM ET' },
  { rd:'22', name:'LAS VEGAS',    country:'USA',           dates:'19–21 NOV',      et:'1:00 AM ET'  },
  { rd:'23', name:'LUSAIL',       country:'Qatar',         dates:'27–29 NOV',      et:'11:00 AM ET' },
  { rd:'24', name:'YAS MARINA',   country:'Abu Dhabi',     dates:'4–6 DEC',        et:'12:00 PM ET' },
]

const BARCODE = [3,1,2,1,4,1,1,2,3,1,2,1,1,4,2,1,3,1,1,2,4,1,1,3,2,1,1,2,3,1,4,1,1,2,1,3,2,1,3,1,1,2]

const CARDS = [
  { label:'BREAKING', title:'Hamilton fastest in FP2',    sub:'Ferrari SF-26 · 1:17.443',        tag:'P0', clr:'#e10600' },
  { label:'DRIVER',   title:'Verstappen tyre strategy',   sub:'Red Bull Racing · Lap 34',         tag:'P1', clr:'#ff6b00' },
  { label:'TEAM',     title:'McLaren double points run',  sub:'Norris + Piastri · Pos 2–3',       tag:'P1', clr:'#ff6b00' },
  { label:'STEWARDS', title:'FIA investigation closed',   sub:'Incident T9 · No further action',  tag:'P2', clr:'#f5c400' },
  { label:'LIVE',     title:'Safety car lap 22',          sub:'Albert Park · Turn 6 incident',    tag:'P0', clr:'#e10600' },
]

const CN = CIRCUITS.map(c=>c.name)
const DN = ['VERSTAPPEN','HAMILTON','NORRIS','LECLERC','PIASTRI','RUSSELL','SAINZ','ALONSO','ALBON','STROLL','GASLY','OCON','HULKENBERG','BEARMAN','TSUNODA','LAWSON','PEREZ','COLAPINTO','BOTTAS','ANTONELLI']
const MC = [...CN,...CN]
const MD = [...DN,...DN]

const pad = (n:number) => String(n).padStart(2,'0')

function useCountdown(d:Date){
  const [v,set]=useState({d:0,h:0,m:0,s:0})
  useEffect(()=>{
    const t=()=>{const diff=d.getTime()-Date.now();if(diff>0)set({d:Math.floor(diff/86400000),h:Math.floor((diff%86400000)/3600000),m:Math.floor((diff%3600000)/60000),s:Math.floor((diff%60000)/1000)})}
    t();const i=setInterval(t,1000);return()=>clearInterval(i)
  },[d]);return v
}

function useInView(){
  const ref=useRef<HTMLDivElement>(null)
  const [v,set]=useState(false)
  useEffect(()=>{
    const o=new IntersectionObserver(([e])=>{if(e.isIntersecting)set(true)},{threshold:0.1})
    if(ref.current)o.observe(ref.current);return()=>o.disconnect()
  },[]);return{ref,v}
}

function Reveal({children,delay=0}:{children:React.ReactNode;delay?:number}){
  const {ref,v}=useInView()
  return<div ref={ref} style={{opacity:v?1:0,transform:v?'translateY(0)':'translateY(20px)',transition:`opacity .55s ease ${delay}ms,transform .55s cubic-bezier(.16,1,.3,1) ${delay}ms`}}>{children}</div>
}

function CardStack({dark}:{dark:boolean}){
  const [a,setA]=useState(0)
  const [flip,setFlip]=useState(false)
  useEffect(()=>{
    const t=setInterval(()=>{setFlip(true);setTimeout(()=>{setA(x=>(x+1)%CARDS.length);setFlip(false)},280)},2600)
    return()=>clearInterval(t)
  },[])
  return(
    <div style={{position:'relative',height:180,perspective:800}}>
      {CARDS.map((c,i)=>{
        const off=(i-a+CARDS.length)%CARDS.length
        let tf='translateZ(-90px)',op=0,zi=0
        if(off===0){tf=flip?'translateZ(0) translateY(-24px) rotateX(8deg)':'translateZ(0)';op=flip?0:1;zi=30}
        if(off===1){tf=flip?'translateZ(0)':'translateZ(-32px) translateY(9px) scale(.94)';op=flip?1:.55;zi=20}
        if(off===2){tf='translateZ(-64px) translateY(18px) scale(.88)';op=.25;zi=10}
        return(
          <div key={i} style={{position:'absolute',inset:0,transition:'transform .28s cubic-bezier(.16,1,.3,1),opacity .25s',transform:tf,opacity:op,zIndex:zi,transformOrigin:'top center'}}>
            <div style={{height:'100%',background:dark?'#141414':'#fff',borderWidth:1,borderStyle:'solid',borderColor:dark?'#2a2a2a':'#eee',borderRadius:7,padding:'13px 15px',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,fontWeight:800,letterSpacing:'.2em',color:'#e10600'}}>{c.label}</span>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,fontWeight:800,background:c.clr,color:'#fff',padding:'2px 5px',borderRadius:2}}>{c.tag}</span>
              </div>
              <div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:19,lineHeight:1.05,color:dark?'#fff':'#000',marginBottom:3}}>{c.title}</div>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:dark?'#555':'#aaa'}}>{c.sub}</div>
              </div>
              <div style={{display:'flex',gap:4}}>
                {CARDS.map((_,j)=><div key={j} style={{height:2,flex:j===a?2:1,background:j===a?'#e10600':dark?'#282828':'#eee',borderRadius:1,transition:'flex .28s'}}/>)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Folder({label,items,dark}:{label:string;items:string[];dark:boolean}){
  const [open,setOpen]=useState(false)
  const bd=dark?'#222':'#e0e0e0'
  return(
    <div style={{cursor:'pointer',userSelect:'none'}} onClick={()=>setOpen(o=>!o)}>
      <div style={{width:68,height:13,background:dark?'#1a1a1a':'#e8e8e8',borderRadius:'4px 8px 0 0',borderWidth:1,borderStyle:'solid',borderColor:bd,borderBottomWidth:0,paddingLeft:7,display:'flex',alignItems:'center'}}>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,color:'#e10600',fontWeight:800,letterSpacing:'.1em'}}>F1B</span>
      </div>
      <div style={{background:dark?'#111':'#f5f5f5',borderWidth:1,borderStyle:'solid',borderColor:bd,borderRadius:'0 5px 5px 5px',overflow:'hidden',maxHeight:open?360:44,transition:'max-height .38s cubic-bezier(.16,1,.3,1)'}}>
        <div style={{padding:'11px 15px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottomWidth:open?1:0,borderBottomStyle:'solid' as const,borderBottomColor:bd}}>
          <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:13,color:dark?'#fff':'#000',letterSpacing:'.04em'}}>{label}</span>
          <span style={{fontSize:10,color:'#e10600',fontWeight:900,transform:open?'rotate(180deg)':'none',transition:'transform .3s',display:'inline-block'}}>▾</span>
        </div>
        <div style={{padding:'3px 15px 12px'}}>
          {items.map((item,i)=>(
            <div key={i} style={{padding:'7px 0',borderBottomWidth:i<items.length-1?1:0,borderBottomStyle:'solid' as const,borderBottomColor:dark?'#1c1c1c':'#ebebeb',display:'flex',alignItems:'center',gap:9}}>
              <span style={{width:4,height:4,borderRadius:'50%',background:'#e10600',flexShrink:0,display:'block'}}/>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:dark?'#999':'#555'}}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function BootScreen({onEnter}:Props){
  const [lights,setLights]=useState(0)
  const [lightsOut,setLightsOut]=useState(false)
  const [stage,setStage]=useState<'lights'|'reveal'>('lights')
  const [dark,setDark]=useState(true)
  const [exiting,setExiting]=useState(false)
  const [secTick,setSecTick]=useState(false)
  const scrollRef=useRef<HTMLDivElement>(null)
  const bgRef=useRef<HTMLDivElement>(null)

  const cd=useCountdown(CURRENT.raceUTC)

  // ── Tightened timing ──
  // Lamps: 700ms per lamp → total 3.5s to light all 5
  // Hold: 800–1200ms (was up to 2.8s)
  // Lights-out visible: 800ms (was 1400ms)
  // Reveal transition: cut immediately
  useEffect(()=>{
    if(stage!=='lights')return
    let n=0
    const t=setInterval(()=>{
      n+=1;setLights(n)
      if(n>=5){
        clearInterval(t)
        setTimeout(()=>{
          setLightsOut(true)
          setTimeout(()=>setStage('reveal'),400)
        },400+Math.random()*200)
      }
    },380)
    return()=>clearInterval(t)
  },[stage])

  useEffect(()=>{const t=setInterval(()=>setSecTick(x=>!x),1000);return()=>clearInterval(t)},[])

  useEffect(()=>{
    if(stage!=='reveal')return
    const el=scrollRef.current,bg=bgRef.current
    if(!el||!bg)return
    const h=()=>{bg.style.transform=`translateY(${el.scrollTop*.22}px)`}
    el.addEventListener('scroll',h,{passive:true});return()=>el.removeEventListener('scroll',h)
  },[stage])

  const isOn=(i:number)=>!lightsOut&&lights>=i
  const go=()=>{setExiting(true);setTimeout(onEnter,600)}

  const bg=dark?'#000':'#f5f5f5'
  const fg=dark?'#fff':'#000'
  const bd=dark?'#1e1e1e':'#ddd'
  const card=dark?'#0a0a0a':'#fff'
  const dim=dark?'#444':'#bbb'
  const sub2=dark?'#282828':'#d0d0d0'

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&family=Barlow+Condensed:ital,wght@0,400;0,700;0,900;1,700;1,900&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

        /* ── Root: position:fixed, flex-center. NO child should fight this. ── */
        #BR{
          position:fixed;inset:0;z-index:9999;
          background:#000;
          display:flex;align-items:center;justify-content:center;
          transition:opacity .6s ease,filter .6s ease;
        }
        #BR.x{opacity:0;filter:blur(16px);pointer-events:none}

        /* ── Gantry: simple column, centred by parent flex ── */
        /* ── Centered gantry ── */
        .gantry-outer {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          background: #000;
        }
        .gantry-inner {
          display: flex; flex-direction: column; align-items: center;
          position: relative;
        }
        .wire {
          position: absolute;
          top: 50px;
          left: 50%; transform: translateX(-50%);
          width: 100vw; height: 2px;
          background: linear-gradient(90deg, transparent, #1e1e1e 20%, #1e1e1e 80%, transparent);
          pointer-events: none;
        }
        .housing {
          position: relative; z-index: 2;
          width: 380px; height: 100px;
          background: #111;
          background-image: repeating-linear-gradient(90deg, transparent 0, transparent 22px, #0b0b0b 22px, #0b0b0b 23px);
          border-radius: 6px 6px 0 0;
          display: flex; align-items: center; justify-content: center;
        }
        .f1-logo {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 900; font-style: italic;
          font-size: 66px; color: #e10600;
          letter-spacing: -.05em; line-height: 1;
          text-shadow: 0 0 32px rgba(225,6,0,.6);
          user-select: none;
        }
        .pod-row {
          position: relative; z-index: 2;
          display: flex;
          background: #0e0e0e;
          border-radius: 0 0 12px 12px;
          overflow: hidden;
        }
        .pod {
          width: 76px;
          padding: 13px 0 17px;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          background: #111;
          flex-shrink: 0;
        }
        .pod + .pod { border-left: 1px solid #090909; }
        .lamp {
          display: block;
          width: 48px; height: 48px;
          min-width: 48px; min-height: 48px;
          border-radius: 50%;
          background: #1d1d1d;
          border: 2px solid #0a0a0a;
          transition: background 450ms ease, box-shadow 450ms ease;
        }
        .lamp.on {
          background: #ff0000;
          box-shadow:
            0 0 10px 3px rgba(255, 0, 0, .9),
            0 0 28px 10px rgba(255, 0, 0, .4),
            inset 0 1px 6px rgba(255, 180, 180, .3);
          transition: background 0ms, box-shadow 0ms;
        }

        /* Ghost names — shown on lights-out */
        .ghost{
          position:absolute;inset:0;
          display:flex;flex-direction:column;justify-content:center;
          overflow:hidden;pointer-events:none;
          opacity:0;transition:opacity 1s ease;
        }
        .ghost.on{opacity:1}
        .gr{
          display:flex;gap:44px;white-space:nowrap;
          font-family:'Barlow Condensed',sans-serif;
          font-weight:900;font-style:italic;
          font-size:clamp(28px,4vw,52px);
          color:rgba(255,255,255,.07);
          letter-spacing:-.02em;line-height:1.2;
          user-select:none;
        }
        .gr.a{animation:mq 28s linear infinite}
        .gr.b{animation:mq 36s linear infinite reverse}
        @keyframes mq{from{transform:translateX(0)}to{transform:translateX(-50%)}}

        /* ── Scroll container ── */
        .sc{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
        .sc::-webkit-scrollbar{width:3px}
        .sc::-webkit-scrollbar-thumb{background:#e10600;border-radius:2px}

        .sec{position:relative;z-index:1;padding:clamp(32px,5vw,60px) clamp(18px,5vw,60px)}
        .divl{height:1px;margin:0 clamp(18px,5vw,60px)}

        /* theme toggle */
        .tb{position:fixed;top:16px;right:16px;z-index:300;width:42px;height:22px;border-radius:11px;border:none;cursor:pointer;display:flex;align-items:center;padding:3px;transition:background .3s}
        .tk{width:16px;height:16px;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.5);transition:transform .3s cubic-bezier(.16,1,.3,1)}

        /* grids */
        .g2{display:grid;grid-template-columns:1fr 1fr;gap:40px}
        @media(max-width:680px){.g2{grid-template-columns:1fr!important}.stub-c{display:none!important}.sess-g{grid-template-columns:1fr 1fr!important}}

        /* ticket layout */
        .tg{
          display:grid;grid-template-columns:1fr 210px;
          position:relative;overflow:hidden;
        }
        .tg::after{
          content:'';position:absolute;
          left:calc(100% - 211px);top:0;bottom:0;width:1px;
          background:repeating-linear-gradient(180deg,rgba(140,140,140,.16) 0,rgba(140,140,140,.16) 5px,transparent 5px,transparent 11px);
        }
        .sess-g{display:grid;grid-template-columns:repeat(4,1fr);gap:1px}

        /* calendar horizontal scroll */
        .cal-row{display:flex;gap:9px;overflow-x:auto;padding-bottom:5px;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:#e10600 transparent}
        .cal-row::-webkit-scrollbar{height:2px}
        .cal-row::-webkit-scrollbar-thumb{background:#e10600;border-radius:2px}
        .cc{flex-shrink:0;width:175px;padding:13px 14px;border-width:1px;border-style:solid;transition:border-color .2s;cursor:pointer}
        .cc:hover{border-color:#e10600!important}

        /* helpers */
        .tag{font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:800;letter-spacing:.2em;color:#e10600;text-transform:uppercase;margin-bottom:7px}
        .stitle{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-style:italic;font-size:clamp(26px,3.5vw,46px);line-height:.9;letter-spacing:-.02em;margin-bottom:20px}
        .btn{padding:15px 26px;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-style:italic;font-size:15px;letter-spacing:.2em;text-transform:uppercase;border:none;cursor:pointer;transition:background .15s,color .15s,letter-spacing .18s,transform .1s}
        .btn:hover{letter-spacing:.3em;transform:translateY(-1px)}
        .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#e10600;margin-right:5px;vertical-align:middle;animation:blink 1.2s ease-in-out infinite}
        @keyframes blink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(.6)}}
        @keyframes fadeup{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

        .sh{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;animation:bob 2s ease-in-out infinite;pointer-events:none}
        @keyframes bob{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(6px)}}

        .par{position:sticky;top:0;height:100vh;overflow:hidden;z-index:0;margin-bottom:-100vh;pointer-events:none}
        .par-i{position:absolute;inset:-15%;will-change:transform;display:flex;flex-direction:column;justify-content:center}
        .pr{display:flex;gap:44px;white-space:nowrap;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-style:italic;letter-spacing:-.02em;line-height:1.2;user-select:none}
      `}</style>

      <div id="BR" className={exiting?'x':''} style={{background:stage==='lights'?'#000':bg,transition:'background .4s,opacity .6s,filter .6s'}}>

        {/* ══ LIGHTS ══ */}
        {stage==='lights'&&(
          <div className="gantry-outer">
            <div className={`ghost${lightsOut?' on':''}`}>
              {Array.from({length:14}).map((_,r)=>(
                <div key={r} className={`gr ${r%2===0?'a':'b'}`}>
                  {(r%2===0?MC:MD).map((n,i)=><span key={i}>{n}</span>)}
                </div>
              ))}
            </div>
            <div className="gantry-inner">
              <div className="wire"/>
              <div className="housing"><span className="f1-logo">F1</span></div>
              <div className="pod-row">
                {[1,2,3,4,5].map(i=>(
                  <div key={i} className="pod">
                    <span className={`lamp${isOn(i)?' on':''}`}/>
                    <span className={`lamp${isOn(i)?' on':''}`}/>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ REVEAL ══ */}
        {stage==='reveal'&&(
          <>
            <button className="tb" style={{background:dark?'#282828':'#ddd'}} onClick={()=>setDark(d=>!d)}>
              <div className="tk" style={{transform:dark?'none':'translateX(20px)',background:dark?'#fff':'#111'}}/>
            </button>

            <div className="sc" ref={scrollRef} style={{color:fg}}>

              {/* Parallax */}
              <div className="par">
                <div className="par-i" ref={bgRef}>
                  {Array.from({length:8}).map((_,r)=>(
                    <div key={r} className="pr" style={{
                      fontSize:`clamp(26px,4vw,56px)`,
                      color:dark?'rgba(255,255,255,.042)':'rgba(0,0,0,.038)',
                      animation:`mq ${25+r*5}s linear infinite${r%2?' reverse':''}`,
                    }}>
                      {(r%2===0?MC:MD).map((n,i)=><span key={i}>{n}</span>)}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── HERO PASS ── */}
              <div className="sec" style={{minHeight:'100vh',display:'flex',flexDirection:'column',justifyContent:'center',paddingTop:64,animation:'fadeup .5s cubic-bezier(.16,1,.3,1) both',position:'relative',zIndex:1}}>

                <div className="tag" style={{marginBottom:14}}>
                  <span className="dot"/>{CURRENT.label} · {CURRENT.name}
                </div>

                <div className="tg" style={{borderWidth:1,borderStyle:'solid',borderColor:bd,background:card,maxWidth:900}}>

                  {/* Main body */}
                  <div style={{display:'flex',flexDirection:'column'}}>
                    <div style={{background:'#e10600',padding:'11px 20px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:'.14em',opacity:.88}}>2026 FIA FORMULA ONE WORLD CHAMPIONSHIP™</span>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,fontWeight:800}}>MEDIA // PADDOCK</span>
                    </div>

                    <div style={{padding:'20px 20px 0',flex:1}}>
                      <div className="tag" style={{marginBottom:9}}>ROUND {CURRENT.round} · 2026 SEASON</div>
                      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:'clamp(32px,5vw,58px)',lineHeight:.9,letterSpacing:'-.02em',marginBottom:16}}>
                        <span style={{display:'block',color:fg}}>{CURRENT.nameA}</span>
                        <span style={{display:'block',WebkitTextStroke:`1.5px ${dark?'#444':'#aaa'}`,WebkitTextFillColor:'transparent'}}>{CURRENT.nameB}</span>
                      </div>

                      <div style={{display:'flex',gap:20,paddingTop:13,borderTopWidth:1,borderTopStyle:'solid' as const,borderTopColor:bd,marginBottom:14,flexWrap:'wrap'}}>
                        {[['Circuit',CURRENT.circuit],['Location',CURRENT.city],['Race (ET)',CURRENT.sessions[3].et]].map(([l,v])=>(
                          <div key={l}>
                            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,color:dim,letterSpacing:'.12em',marginBottom:2}}>{l}</div>
                            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:14,fontWeight:700,color:fg}}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Sessions */}
                      <div className="sess-g" style={{background:dark?'#060606':'#f0f0f0',borderWidth:1,borderStyle:'solid' as const,borderColor:bd}}>
                        {CURRENT.sessions.map((s,i)=>{
                          const past=s.utc.getTime()<Date.now()
                          const next=!past&&CURRENT.sessions.slice(0,i).every(x=>x.utc.getTime()<Date.now())
                          return(
                            <div key={i} style={{padding:'9px 10px',borderRightWidth:i<3?1:0,borderRightStyle:'solid' as const,borderRightColor:bd,background:next?(dark?'#110808':'#fff0f0'):'transparent'}}>
                              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,fontWeight:800,letterSpacing:'.14em',color:next?'#e10600':past?sub2:dim,marginBottom:3}}>{s.n}</div>
                              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:past?sub2:fg,lineHeight:1.4}}>{s.et}</div>
                              {past&&<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,color:sub2,marginTop:2}}>DONE</div>}
                              {next&&<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,color:'#e10600',marginTop:2}}>NEXT ▶</div>}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Countdown */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',background:dark?'#060606':'#ececec',borderTopWidth:1,borderTopStyle:'solid' as const,borderTopColor:bd}}>
                      {([[cd.d,'DAYS'],[cd.h,'HRS'],[cd.m,'MIN'],[cd.s,'SEC']] as [number,string][]).map(([v,l],i)=>(
                        <div key={l} style={{textAlign:'center',padding:'13px 0',borderRightWidth:i<3?1:0,borderRightStyle:'solid' as const,borderRightColor:bd}}>
                          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:'clamp(24px,3vw,38px)',fontWeight:900,fontStyle:'italic',lineHeight:1,letterSpacing:'-.03em',color:l==='SEC'&&secTick?'#e10600':fg,transition:'color .1s'}}>{pad(v)}</div>
                          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,letterSpacing:'.14em',marginTop:2,color:dim}}>{l}</div>
                        </div>
                      ))}
                    </div>

                    <button className="btn" style={{width:'100%',background:'#fff',color:'#000',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'15px 20px'}} onClick={go}>
                      <span>INITIALIZE UPLINK</span>
                      <span style={{background:'#e10600',color:'#fff',padding:'3px 12px',fontSize:16}}>→</span>
                    </button>
                  </div>

                  {/* Stub */}
                  <div className="stub-c" style={{background:dark?'#070707':'#f8f8f8',padding:'14px 16px',display:'flex',flexDirection:'column',gap:12}}>
                    <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,fontWeight:800,color:'#e10600',letterSpacing:'.15em'}}>F1 BULLETIN // ACCESS</div>
                    {[['Credential','SEASON PADDOCK'],['Unit','RACE CONTROL'],['Access','LEVEL 1 — FULL'],['Season','2026 · 24 ROUNDS'],['Status','● LIVE NOW']].map(([l,v])=>(
                      <div key={l}>
                        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,color:dim,letterSpacing:'.12em',marginBottom:2}}>{l}</div>
                        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,fontWeight:700,color:(String(v).includes('●')||String(v).includes('FULL'))?'#e10600':fg}}>{v}</div>
                      </div>
                    ))}
                    <div style={{marginTop:'auto',height:40,display:'flex',alignItems:'stretch',gap:1.5,opacity:.18}}>
                      {BARCODE.map((w,i)=><div key={i} style={{width:w*1.2,background:i%2===0?(dark?'#fff':'#000'):'transparent'}}/>)}
                    </div>
                  </div>
                </div>

                <div className="sh">
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:dim,letterSpacing:'.18em'}}>SCROLL</div>
                  <div style={{fontSize:11,color:dim}}>↓</div>
                </div>
              </div>

              <div className="divl" style={{background:bd}}/>

              {/* ── CARDS + FOLDERS ── */}
              <div className="sec" style={{position:'relative',zIndex:1}}>
                <div className="g2">
                  <Reveal>
                    <div className="tag">LIVE INTELLIGENCE</div>
                    <div className="stitle" style={{color:fg}}>LATEST<br/><span style={{WebkitTextStroke:`1px ${dark?'#333':'#ccc'}`,WebkitTextFillColor:'transparent'}}>STORIES</span></div>
                    <CardStack dark={dark}/>
                  </Reveal>
                  <Reveal delay={80}>
                    <div className="tag">INTEL BRIEFINGS</div>
                    <div className="stitle" style={{color:fg}}>OPEN<br/><span style={{WebkitTextStroke:`1px ${dark?'#333':'#ccc'}`,WebkitTextFillColor:'transparent'}}>FOLDERS</span></div>
                    <div style={{display:'flex',flexDirection:'column',gap:9}}>
                      <Folder label="RACE BRIEFING"    items={['Hamilton P1 after FP2','Verstappen floor concern','McLaren strategy debrief 18:00']} dark={dark}/>
                      <Folder label="DRIVER SENTIMENT" items={['Norris +0.42 sentiment spike','Leclerc controversy index: 8.1','Alonso media coverage: HIGH']} dark={dark}/>
                      <Folder label="TEAM ANALYSIS"    items={['Red Bull tyre deg anomaly','Ferrari PU mode data','Mercedes floor upgrade effect']} dark={dark}/>
                    </div>
                  </Reveal>
                </div>
              </div>

              <div className="divl" style={{background:bd}}/>

              {/* ── CALENDAR ── */}
              <div className="sec" style={{position:'relative',zIndex:1}}>
                <Reveal>
                  <div className="tag">2026 CALENDAR — 24 ROUNDS · RACE TIMES IN ET</div>
                  <div className="stitle" style={{color:fg,marginBottom:24}}>2026<br/><span style={{WebkitTextStroke:`1px ${dark?'#333':'#ccc'}`,WebkitTextFillColor:'transparent'}}>SCHEDULE</span></div>
                  {[
                    {label:'Q1 — MAR / APR', rounds:CIRCUITS.slice(0,5)},
                    {label:'Q2 — MAY / JUN', rounds:CIRCUITS.slice(5,10)},
                    {label:'Q3 — JUL / AUG', rounds:CIRCUITS.slice(10,14)},
                    {label:'Q4 — SEP / DEC', rounds:CIRCUITS.slice(14)},
                  ].map(({label,rounds})=>(
                    <div key={label} style={{marginBottom:26}}>
                      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,fontWeight:800,color:dim,letterSpacing:'.18em',marginBottom:9}}>{label}</div>
                      <div className="cal-row">
                        {rounds.map((c,i)=>{
                          const cur=c.rd===CURRENT.round
                          return(
                            <div key={i} className="cc" style={{borderColor:cur?'#e10600':bd,background:cur?(dark?'#110808':'#fff0f0'):card}}>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:7}}>
                                <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:'#e10600',fontWeight:800,letterSpacing:'.14em'}}>RD {c.rd}</span>
                                {cur&&<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,color:'#e10600',animation:'blink 1.2s infinite'}}>● NOW</span>}
                              </div>
                              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15,color:fg,marginBottom:2}}>{c.name}</div>
                              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:dim,marginBottom:6}}>{c.country}</div>
                              <div style={{borderTopWidth:1,borderTopStyle:'solid' as const,borderTopColor:dark?'#1c1c1c':'#e8e8e8',paddingTop:7}}>
                                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7,color:dim,letterSpacing:'.1em',marginBottom:2}}>{c.dates}</div>
                                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:cur?'#e10600':fg,fontWeight:cur?800:400}}>{c.et}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </Reveal>
              </div>

              {/* ── FINAL CTA ── */}
              <div className="sec" style={{paddingBottom:72,position:'relative',zIndex:1}}>
                <Reveal>
                  <div style={{background:'#e10600',padding:'clamp(24px,5vw,56px)',display:'flex',flexDirection:'column',gap:14}}>
                    <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,fontWeight:800,letterSpacing:'.2em',opacity:.7}}>F1 BULLETIN — INTELLIGENCE TERMINAL</div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontStyle:'italic',fontSize:'clamp(48px,8vw,100px)',lineHeight:.9,letterSpacing:'-.03em',color:'#fff',whiteSpace:'nowrap'}}>READY TO UPLINK?</div>
                    <button className="btn" style={{background:'#fff',color:'#000',alignSelf:'flex-start'}} onClick={go}>ENTER TERMINAL →</button>
                  </div>
                </Reveal>
              </div>

            </div>
          </>
        )}
      </div>
    </>
  )
}