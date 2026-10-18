export const reliabilityDictionary: Record<'uk'|'nl', Record<string, string>> = {
  uk: {
"Revolution explained":"Як працює революція",
"Greater revolution":"Велика революція",
"Revolution":"Революція",
"Declare greater revolution ✶":"Оголосити велику революцію ✶",
"The player holding both Jesters is the Greater Peon. Declaring a greater revolution reverses every player’s rank and cancels all card exchanges for this round.":"Обидва Блазні у Великого Селянина. Велика революція змінює порядок усіх рангів на протилежний і скасовує всі обміни картами в цьому раунді.",
"Holding both Jesters lets a player declare a revolution. All card exchanges are cancelled for this round; everyone keeps their rank.":"Гравець з обома Блазнями може оголосити революцію. Всі обміни картами в цьому раунді скасовуються; ранги залишаються незмінними.",
"Continuing to taxes declines the revolution. The usual card exchanges take place.":"Продовжити до податків — означає відмовитися від революції. Відбудуться звичайні обміни картами.",
"No player holds both Jesters. The host can continue to taxation.":"Ніхто не має обох Блазнів. Організатор може перейти до податків.",

"Review your selection":"Перевірте вибір карт",
"Complete your set":"Завершіть набір",
"Select cards to play":"Оберіть карти для ходу",
"Clear selection":"Очистити вибір",
"The table changed. Select cards again or clear your selection.":"Ситуація на столі змінилася. Оберіть карти знову або очистіть вибір.",

"Select a matching set. Only playable combinations can be selected.": "Оберіть набір карт одного рангу. Доступні лише можливі ходи.",
"No matching set can beat the table. You can pass.": "У вас немає набору, що поб’є карти на столі. Можна пропустити хід.",
"Ready to play.": "Можна викладати.",
"Add matching cards to complete your set.": "Додайте карти, щоб завершити набір.",
"Pass this turn?": "Пропустити цей хід?",
"Pass this turn…": "Пропустити хід…",
"Confirm pass": "Так, пропустити",
"Keep playing": "Продовжити вибір",

    'Computer is thinking…': 'Комп’ютер обмірковує хід…',
    'Restoring your room…': 'Відновлюємо вашу кімнату…',
    'Cancel room recovery': 'Скасувати відновлення кімнати',
    'Waiting for confirmation of your last action.': 'Очікуємо підтвердження вашої останньої дії.',
    'The game changed. Review the table and try again.': 'Стан гри змінився. Перевірте стіл і спробуйте ще раз.',
    'Please refresh the page to update the game.': 'Оновіть сторінку, щоб завантажити нову версію гри.',
    'This request ID was already used for a different action.': 'Цей запит уже використано для іншої дії. Оновіть сторінку.',
    'Room code collision. Please create a new room.': 'Цей код кімнати вже зайнято. Створіть нову кімнату.',
    'Device storage is unavailable. Enable storage to play safely.': 'Сховище пристрою недоступне. Дозвольте збереження даних для безпечної гри.',
    'Could not restore the pending action.': 'Не вдалося відновити непідтверджену дію.',
    'Pending action': 'Непідтверджена дія',
    'Yes': 'Так', 'No': 'Ні',
  },
  nl: {
"Revolution explained":"Uitleg over de revolutie",
"Greater revolution":"Grote revolutie",
"Revolution":"Revolutie",
"Declare greater revolution ✶":"Grote revolutie uitroepen ✶",
"The player holding both Jesters is the Greater Peon. Declaring a greater revolution reverses every player’s rank and cancels all card exchanges for this round.":"De speler met beide Narren is de Grote Dienaar. Een grote revolutie keert de volledige rangorde om en schrapt alle kaartenruil voor deze ronde.",
"Holding both Jesters lets a player declare a revolution. All card exchanges are cancelled for this round; everyone keeps their rank.":"Een speler met beide Narren mag een revolutie uitroepen. Alle kaartenruil vervalt voor deze ronde; iedereen behoudt zijn rang.",
"Continuing to taxes declines the revolution. The usual card exchanges take place.":"Doorgaan naar de belasting betekent afzien van de revolutie. De gebruikelijke kaartenruil gaat dan door.",
"No player holds both Jesters. The host can continue to taxation.":"Niemand heeft beide Narren. De host kan doorgaan naar de belasting.",

"Review your selection":"Controleer je selectie",
"Complete your set":"Maak je set compleet",
"Select cards to play":"Kies kaarten om te spelen",
"Clear selection":"Selectie wissen",
"The table changed. Select cards again or clear your selection.":"De tafel is veranderd. Kies opnieuw kaarten of wis je selectie.",

"Select a matching set. Only playable combinations can be selected.": "Kies kaarten van dezelfde rang. Alleen speelbare combinaties zijn beschikbaar.",
"No matching set can beat the table. You can pass.": "Je hebt geen set die de tafel verslaat. Je kunt passen.",
"Ready to play.": "Klaar om te spelen.",
"Add matching cards to complete your set.": "Voeg passende kaarten toe om je set compleet te maken.",
"Pass this turn?": "Deze beurt passen?",
"Pass this turn…": "Deze beurt passen…",
"Confirm pass": "Bevestig passen",
"Keep playing": "Verder spelen",

    'Computer is thinking…': 'De computer denkt na…',
    'Restoring your room…': 'Je kamer wordt hersteld…',
    'Cancel room recovery': 'Herstellen annuleren',
    'Waiting for confirmation of your last action.': 'We wachten op bevestiging van je laatste actie.',
    'The game changed. Review the table and try again.': 'Het spel is veranderd. Controleer de tafel en probeer het opnieuw.',
    'Please refresh the page to update the game.': 'Vernieuw de pagina om het spel bij te werken.',
    'This request ID was already used for a different action.': 'Dit verzoek is al voor een andere actie gebruikt. Vernieuw de pagina.',
    'Room code collision. Please create a new room.': 'Deze kamercode is al in gebruik. Maak een nieuwe kamer.',
    'Device storage is unavailable. Enable storage to play safely.': 'Apparaatopslag is niet beschikbaar. Sta opslag toe om veilig te spelen.',
    'Could not restore the pending action.': 'De onbevestigde actie kon niet worden hersteld.',
    'Pending action': 'Onbevestigde actie',
    'Yes': 'Ja', 'No': 'Nee',
  },
};

Object.assign(reliabilityDictionary.uk,{
'Host':'Організатор','online':'Онлайн','offline':'Не в мережі','reconnecting':'Відновлює з’єднання','computer':'Комп’ютер',
'Computer takeover':'Комп’ютер замінює гравця','Replace with computer':'Замінити комп’ютером','Reclaim my seat':'Повернути моє місце','Leave table':'Залишити стіл',
'A computer is playing your seat. You can take it back between rounds.':'Комп’ютер грає на вашому місці. Ви можете повернутися між раундами.',
'Only the host can replace disconnected players.':'Лише організатор може замінити відсутнього гравця.',
'Choose a disconnected human player.':'Оберіть гравця, який не в мережі.',
'Wait for the 60-second disconnect grace period.':'Зачекайте 60 секунд після втрати з’єднання.',
'Your seat is not controlled by the computer.':'Комп’ютер не керує вашим місцем.',
'You can reclaim your seat between rounds.':'Повернути своє місце можна між раундами.'
});
Object.assign(reliabilityDictionary.nl,{
'Host':'Gastheer','online':'Online','offline':'Offline','reconnecting':'Opnieuw verbinden','computer':'Computer',
'Computer takeover':'Computer neemt over','Replace with computer':'Vervangen door computer','Reclaim my seat':'Neem mijn plaats terug','Leave table':'Verlaat de tafel',
'A computer is playing your seat. You can take it back between rounds.':'Een computer speelt op jouw plaats. Je kunt tussen rondes terugkomen.',
'Only the host can replace disconnected players.':'Alleen de gastheer kan afwezige spelers vervangen.',
'Choose a disconnected human player.':'Kies een menselijke speler die offline is.',
'Wait for the 60-second disconnect grace period.':'Wacht tot de verbindingspauze van 60 seconden voorbij is.',
'Your seat is not controlled by the computer.':'Je plaats wordt niet door de computer bestuurd.',
'You can reclaim your seat between rounds.':'Je kunt je plaats tussen rondes terugnemen.'
});
Object.assign(reliabilityDictionary.uk,{
'Invalid game request.':'Некоректний запит гри.',
'Cross-site requests are not allowed.':'Запити з іншого сайту заборонені.',
'Send a JSON game request.':'Некоректний формат запиту гри. Оновіть сторінку.',
'Game request is too large.':'Запит гри завеликий.',
'Too many requests. Please wait a minute.':'Забагато запитів. Зачекайте хвилину.'
});
Object.assign(reliabilityDictionary.nl,{
'Invalid game request.':'Ongeldig spelverzoek.',
'Cross-site requests are not allowed.':'Verzoeken vanaf een andere website zijn niet toegestaan.',
'Send a JSON game request.':'Ongeldig verzoekformaat. Vernieuw de pagina.',
'Game request is too large.':'Het spelverzoek is te groot.',
'Too many requests. Please wait a minute.':'Te veel verzoeken. Wacht een minuut.'
});
Object.assign(reliabilityDictionary.uk,{
'Browser release':'Версія браузерного застосунку','Server release':'Версія сервера','Progress':'Перебіг гри',
'normal':'Без затримок','waiting-for-player':'Очікуємо відсутнього гравця','no-progress':'Понад 5 хвилин без змін',
'A new release is available. Refresh when your pending action is confirmed.':'Доступна нова версія. Оновіть сторінку після підтвердження останньої дії.'
});
Object.assign(reliabilityDictionary.nl,{
'Browser release':'Browserversie','Server release':'Serverversie','Progress':'Spelvoortgang',
'normal':'Normaal','waiting-for-player':'Wachten op afwezige speler','no-progress':'Meer dan 5 minuten zonder voortgang',
'A new release is available. Refresh when your pending action is confirmed.':'Er is een nieuwe versie. Vernieuw de pagina zodra je laatste actie is bevestigd.'
});
