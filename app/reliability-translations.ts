export const reliabilityDictionary: Record<'uk'|'nl', Record<string, string>> = {
  uk: {
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
