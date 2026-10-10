import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Dalmuti · The Family Table',description:'Claim the crown. A private multiplayer card table for your family.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
