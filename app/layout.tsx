import type { Metadata } from 'next';
import './globals.css';
import {BRAND} from './brand';
export const metadata:Metadata={title:BRAND.name+' · '+BRAND.tagline,description:BRAND.description,metadataBase:new URL('https://crownturn.com'),alternates:{canonical:'/'},twitter:{card:'summary_large_image',images:['/share.png']},openGraph:{title:BRAND.name,siteName:BRAND.name,description:BRAND.description,type:"website",url:"https://crownturn.com/",images:[{url:"/share.png",width:1200,height:630,alt:BRAND.name+" — "+BRAND.tagline}]}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
