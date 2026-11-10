'use client';

import { useEffect, useState } from 'react';
import { sendGrowth } from './growth-client';
import { copyInvite, createInvite, shareInvite, type ShareResult } from './invite-sharing';
import { translate, type Language } from './i18n';

type Props = { code: string; lang: Language; testMode?: boolean; showCode?: boolean; isLobby?: boolean; full?: boolean };

export function InviteControls({ code, lang, testMode = false, showCode = false, isLobby = false, full = false }: Props) {
  const t = (text: string) => translate(text, lang);
  const [nativeShare, setNativeShare] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => { setNativeShare(typeof navigator.share === 'function'); }, []);
  // Do not show the previous room's link while reconnecting or switching rooms.
  useEffect(() => { setFeedback(''); setManualUrl(''); }, [code]);

  const resultMessage = (result: ShareResult, url: string) => {
    setManualUrl(result === 'manual' ? url : '');
    setFeedback(result === 'shared' ? t('Sharing completed.') :
      result === 'copied' ? t('Invitation link copied!') :
      result === 'manual' ? t('Automatic copying is unavailable. Select the link below and copy it manually.') : '');
    if (!testMode && result === 'copied') sendGrowth('invite_copied', 'invite');
    if (!testMode && result === 'shared') sendGrowth('invite_shared', 'invite');
  };

  const invite = () => createInvite(location.origin, code, lang);
  const copy = () => {
    // Copy is separate from native share, so users always have a direct fallback.
    const data = invite();
    void copyInvite(data.url,
      navigator.clipboard?.writeText ? text => navigator.clipboard.writeText(text) : undefined
    ).then(result => resultMessage(result, data.url));
  };
  const share = () => {
    const data = invite();
    void shareInvite(data,
      typeof navigator.share === 'function' ? payload => navigator.share(payload) : undefined,
      navigator.clipboard?.writeText ? text => navigator.clipboard.writeText(text) : undefined
    ).then(result => resultMessage(result, data.url));
  };

  return <div className="invite-controls">
    <div className="invite-controls-row">
      {showCode && <span className="invite-room-code">{t('Room')} <b>{code}</b></span>}
      {nativeShare && <button type="button" className="outline invite-share" onClick={share} aria-label={t('Share invitation')}>{<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8.7 10.5l6.6-3.8M8.7 13.5l6.6 3.8"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/></svg>}{t('Share')}</button>}
      <button type="button" className="outline invite-copy" onClick={copy}>{t(nativeShare ? 'Copy link' : 'Copy invitation')}</button>
    </div>
    {feedback && <p className="invite-feedback" role="status" aria-live="polite">{feedback}</p>}
    {manualUrl && <input className="invite-manual-link" aria-label={t('Invitation link to copy manually')} readOnly value={manualUrl} onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()}/>}
    {isLobby && full && <p className="invite-full-hint">{t('All seats are taken. New players cannot join this table.')}</p>}
  </div>;
}
