import { appUrl } from '../lib/base-path';
import { useId, useState } from 'react';
import { pathFor, pointOn, RECORD_PATH, ROAD } from './motion';
import type { SceneFrame } from './motion';

function Callout({ x, y, title, detail, path, anchor, accent = false, width = 330, short }: {
  x: number; y: number; title: string; detail: string; path: string; anchor: [number, number]; accent?: boolean; width?: number; short: string;
}) {
  const origin = path.match(/^M(-?[\d.]+) (-?[\d.]+)/)!;
  const mobileX = Number(origin[1]) - 62.5;
  const mobileY = Number(origin[2]) + (anchor[1] > Number(origin[2]) ? -75 : 0);
  return <g className={`rl-story__callout${accent ? ' rl-story__callout--copper' : ''}`}>
    <path className="rl-story__leader" d={path} />
    <circle className="rl-story__anchor-ring" cx={anchor[0]} cy={anchor[1]} r="13" />
    <circle className="rl-story__anchor" cx={anchor[0]} cy={anchor[1]} r="4" />
    <rect className="rl-story__label-surface" x={x} y={y} width={width} height="88" rx="7" />
    <text className="rl-story__label-kicker" x={x + 16} y={y + 29}>{detail}</text>
    <text className="rl-story__label-title" x={x + 16} y={y + 62}>{title}</text>
    <g className="rl-story__mobile-callout"><rect x={mobileX} y={mobileY} width="125" height="75" rx="7" /><text x={mobileX + 16} y={mobileY + 49}>{short}</text></g>
  </g>;
}

export default function StoryScene({ step, frame, still }: { step: number; frame: SceneFrame; still: boolean }) {
  const [missingArt, setMissingArt] = useState(false);
  const id = useId().replaceAll(':', '');
  const truck = pointOn(ROAD, frame.truck);
  const record = pointOn(RECORD_PATH, frame.evidence);
  const camera = `translate(${frame.worldX} ${frame.worldY}) translate(768 512) scale(${frame.worldScale}) translate(-768 -512)`;

  return <div className="rl-story__scene" data-still={still}>
    {/* Hidden probes let image failures surface as a readable static fallback. */}
    <img className="rl-story__asset-probe" src={appUrl("/story/plant-road-dc.png")} alt="" onError={() => setMissingArt(true)} />
    <img className="rl-story__asset-probe" src={appUrl("/story/dock-office.png")} alt="" onError={() => setMissingArt(true)} />
    <img className="rl-story__asset-probe" src={appUrl("/story/truck.png")} alt="" onError={() => setMissingArt(true)} />
    {missingArt ? <div className="rl-story__art-fallback"><strong>{step === 0 ? 'Inside the shipping dock' : 'Plant → Retailer → Accounting'}</strong><span>{step === 0 ? 'Print the BOL. Capture the pickup signature. Retain the signed copy.' : 'Pickup, receiving and document availability each need their own evidence.'}</span></div> :
      <svg className="rl-story__canvas" viewBox="0 0 1536 1024" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
        <title id={`${id}-title`}>{step === 0 ? 'Inside the shipping dock: printer, unsigned BOL and scanner.' : 'A truck journey from the plant toward the retailer, with a separate document path to Accounting.'}</title>
        <desc id={`${id}-desc`}>Presenter-controlled illustration. It does not show a real shipment location, delivery acknowledgement or stored-document receipt.</desc>
        <defs><clipPath id={`${id}-clip`}><rect width="1536" height="1024" rx="10" /></clipPath></defs>
        <g clipPath={`url(#${id}-clip)`}>
          <g opacity={frame.worldOpacity} transform={camera}>
            <image href={appUrl("/story/plant-road-dc.png")} width="1536" height="1024" />
            <path className="rl-story__road-underlay" d={pathFor(ROAD)} />
            <path className="rl-story__road-progress" d={pathFor(ROAD)} pathLength="1" strokeDasharray="1" strokeDashoffset={1 - frame.truck} />
            {step === 3 && <g>
              <path className="rl-story__evidence-underlay" d={pathFor(RECORD_PATH)} />
              <path className="rl-story__evidence-progress" d={pathFor(RECORD_PATH)} pathLength="1" strokeDasharray="1" strokeDashoffset={1 - frame.evidence} />
              <circle className="rl-story__evidence-dot" cx={record.x} cy={record.y} r="9" />
            </g>}
            <g transform={`translate(${truck.x} ${truck.y})`} className="rl-story__vehicle" data-road-progress={frame.truck.toFixed(3)}>
              <ellipse className="rl-story__truck-ground" cx="0" cy="0" rx="55" ry="17" transform="rotate(-24)" />
              {/* (920,680) is the wheel-contact origin in the unmodified 1536×1024 cutout. */}
              <image href={appUrl("/story/truck.png")} x="-184" y="-136" width="307.2" height="204.8" />
              {step === 2 && <g opacity={Math.min(1, frame.truck * 4)}><path className="rl-story__leader" d="M65 -166 L82 -92" /><circle className="rl-story__anchor" cx="82" cy="-92" r="5" /><g className="rl-story__truck-label"><rect className="rl-story__label-surface" x="-120" y="-250" width="345" height="84" rx="7" /><text className="rl-story__label-kicker" x="-104" y="-221">THIRD-PARTY CARRIER</text><text className="rl-story__label-title" x="-104" y="-189">Illustrated journey</text></g><g className="rl-story__mobile-callout"><rect x="-25" y="-250" width="180" height="84" rx="7" /><text x="-9" y="-198">TRUCK</text></g></g>}
            </g>
            {(step === 1 || step === 3) && <Callout x={95} y={235} title="Ridgeline plant" detail={step === 1 ? 'PICKUP ACKNOWLEDGEMENT' : 'SOURCE RECORD'} path="M340 323 L370 460 L427 580" anchor={[427, 580]} short="PLANT" />}
            {step >= 2 && <Callout x={920} y={60} width={395} title="Retailer distribution centre" detail="SEPARATE RECEIVING EVIDENCE" path="M1110 148 L1140 195 L1188 258" anchor={[1188, 258]} short="DC" />}
            {step === 1 && <g className="rl-story__map-note"><rect x="900" y="835" width="490" height="97" rx="7" /><text x="920" y="871">THE PROOF TO OPEN</text><text x="920" y="908">Review → Sign → Demo service</text></g>}
            {step === 3 && <Callout x={1080} y={885} width={410} title="Retrieve & assess" detail="ACCOUNTING" path="M1235 885 L1235 865" anchor={[1235, 865]} short="AR" />}
          </g>
          <g opacity={frame.officeOpacity} transform={`translate(768 512) scale(${frame.officeScale}) translate(-768 -512)`}>
            <image href={appUrl("/story/dock-office.png")} width="1536" height="1024" />
            <Callout x={130} y={170} width={330} title="BOL on paper" detail="01 / PRINT" path="M350 258 L400 320 L485 410" anchor={[485, 410]} short="01" />
            <Callout x={355} y={825} width={380} title="Signature to capture" detail="02 / SIGN" path="M645 825 L680 720 L722 607" anchor={[722, 607]} short="02" accent />
            <Callout x={1110} y={750} width={390} title="Signed copy to retain" detail="03 / SCAN & STORE" path="M1155 750 L1100 695 L1010 631" anchor={[1010, 631]} short="03" />
          </g>
        </g>
      </svg>}
  </div>;
}
