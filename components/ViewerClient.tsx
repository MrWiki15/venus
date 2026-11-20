'use client';
import dynamic from 'next/dynamic';

const Viewer = dynamic(() => import('./Viewer'), { ssr: false });

export default function ViewerClient() {
  return <Viewer />;
}
