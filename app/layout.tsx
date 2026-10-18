import type { Metadata } from 'next';
import './globals.css';
import {BRAND} from './brand';
export const metadata:Metadata={title:BRAND.name+' · '+BRAND.tagline,description:BRAND.description,openGraph:{title:BRAND.name,siteName:BRAND.name,description:BRAND.description,type:"website"}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
