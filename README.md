# Kinto Mode

Pomarańczowy motyw dla Claude inspirowany Dragon Ballem. Jasny w dzień, ciemny w nocy, z malowanym tłem górskim i Goku, który leci na Kinto-un w oddali. To nie tylko skórka: mod mierzy „poziom mocy" Twojej sesji, zbiera smocze kule z listy zadań i przywołuje Shenrona, gdy wszystkie są zebrane.

> Poziom mocy tej paczki: ponad 9000. Instalacja: kilka sekund.

## Co dostajesz

| Funkcja | Jak działa |
| --- | --- |
| **Motyw kolorystyczny** | Paleta pomarańczu, kremu i brązu w trybie jasnym i ciemnym. Akcent `#F57C00`, niebieski `#1F4E9E` jako kolor dodatkowy. |
| **Tło z górami** | Pomarańczowe niebo i góry z grafiki wygenerowanej w ComfyUI, wbudowane jako SVG. Panele rozmywają się nad nim, a tekst zostaje czytelny. |
| **Goku w locie** | W spoczynku unosi się w oddali. Gdy Claude pracuje, rusza z miejsca, przelatuje przez scenę, wraca z lewej i hamuje w domu. |
| **Kamehameha** | Po zakończeniu tury Goku odpala jednorazowy błysk. |
| **Poziom mocy** | Pasek nad polem pisania pokazuje użycie kontekstu sesji w procentach, tak jak panel kontekstu w aplikacji (względem okna kompresji). Przy 25, 50, 75 i 90% są dźwięk i toast, a powyżej 9000 dopisek „ponad 9000!". Moc jest też w pasku statusu. |
| **Smocze kule** | Ukończone kroki listy zadań przywołują żółto-pomarańczowe kule z czerwonymi gwiazdkami (1–7), która lewituje wokół czatu, na przemian po lewej i po prawej, w różnych rozmiarach. Zawsze jest 7 kul, rozłożonych równo między kroki (3 kroki dają 2, 2 i 3 kule). Po ukończeniu listy kule bieleją, rozbłyskują i znikają, a potem wypływa Shenron. Kula powstała w ComfyUI (wzór koloru i połysku), gwiazdki są rysowane wektorowo. |
| **Shenron** | Gdy wszystkie zadania są ukończone, zielony smok przelatuje raz przez niebo nad górami (ok. 45 sekund). Jest rozplątany i faluje po sinusoidzie: ciało to gładka wstęga, której kształt animuje CSS klatka po klatce, więc fala biegnie od głowy do ogona, a głowa (wektoryzowana z grafiki z ComfyUI, z domalowanym okiem) kiwa się razem z nią. Po przelocie znika i nie wraca, dopóki nie zbierzesz kul od nowa. |
| **Trzy tła** | Zachód słońca (6–19), zmierzch z purpurowym niebem (19–22) i gwiaździsta noc (22–6). Domyślnie `auto` wybiera według pory dnia, a konkretne tło ustawisz komendą `/tlo-kinto`. |
| **Gwiazdy** | Na zmierzchu i w nocy na czystym niebie migają drobne gwiazdy, każda we własnym rytmie. Noc ma ich najwięcej. |
| **Dopiski przy narzędziach** | Pod wywołaniem narzędzia: „ładowanie ki…", „cios trafił" albo „atak nieudany". |
| **Dźwięki i toasty per zdarzenie** | Konfigurowalne w jednej tabeli (patrz niżej). |

## Instalacja

Mod jest marketplace'em jednego pluginu. W terminalowej sesji Claude Code:

```
/plugin install goku --marketplace <właściciel>/<repo>
```

Potwierdź dodanie marketplace'u (`y`) i wybierz zasięg instalacji.

### Test z lokalnego folderu

Zanim opublikujesz repozytorium, możesz przetestować mod prosto z dysku:

```bash
claude plugin marketplace add F:/dev/calude-kinto-mode
claude plugin install goku@kinto-mode
```

Po edycji plików w tym folderze odśwież mod w sesji komendą `/reload-plugins`.

Tryb deweloperski, bez instalacji (tylko na czas jednej sesji):

```bash
claude --plugin-dir F:/dev/calude-kinto-mode
```

### Telefon

Mod działa na komputerze, a aplikacja mobilna rysuje wysłany przez niego motyw. Otwórz na telefonie sesję, którą hostuje komputer z zainstalowanym modem (np. przez Remote Control). Na wąskim ekranie tło jest przycinane do środka, więc Goku może wypaść z kadru. Nie testowałem tego na prawdziwym telefonie.

## Komendy

Komendy mają przyrostek `-kinto`, żeby nie myliły się z komendami innych pluginów.

| Komenda | Efekt |
| --- | --- |
| `/aura-kinto` | Przełącza lot ciągły: Goku leci cały czas, a nie tylko wtedy, gdy Claude pracuje. |
| `/tlo-kinto` | Pokazuje aktualne tło. `/tlo-kinto zachod`, `zmierzch` albo `noc` wymusza wybrane tło, `/tlo-kinto auto` wraca do wyboru według pory dnia. Wybór pamięta bieżąca sesja. |
| `/shenron-kinto` | Przywołuje Shenrona bez zbierania kul (do testów). `/shenron-kinto stop` odsyła go. |
| `/aura-kinto styl` | Włącza albo wyłącza lekki styl Dragon Ball w odpowiedziach. Odpowiedzi zostają rzeczowe, od czasu do czasu pojawia się krótkie nawiązanie, na przykład do „poziomu mocy" zadania. Domyślnie wyłączone. |

## Konfiguracja zdarzeń

Dźwięki i powiadomienia ustawiasz w tabeli `EVENTY` na górze pliku [`hooks/register.tsx`](hooks/register.tsx):

```ts
const EVENTY: Record<string, Reakcja> = {
  start:   { dzwiek: 'sounds/start.wav' },
  koniec:  { dzwiek: 'sounds/koniec.wav', toast: 'Kamehameha! Tura zakończona.' },
  poziom:  { dzwiek: 'sounds/poziom.wav', toast: 'Poziom mocy: {n}' },
  kompakt: { dzwiek: 'sounds/kompakt.wav', toast: 'Kontekst skompresowany: moc spada.' },
  kula:    { dzwiek: 'sounds/kula.wav', toast: 'Smocza kula zebrana: {n}' },
  shenron: { dzwiek: 'sounds/shenron.wav', toast: 'Wszystkie smocze kule zebrane! Shenron się pojawia.' },
}
```

- `dzwiek`: ścieżka do pliku w folderze `sounds/`. Pusty napis lub brak klucza oznacza ciszę.
- `toast`: tekst powiadomienia. `{n}` zastępuje poziom mocy albo liczbę zebranych kul.
- Zdarzenia: `start` (początek tury), `koniec` (koniec tury), `poziom` (nowy próg mocy), `kompakt` (kompresja kontekstu), `kula` (ukończony krok listy), `shenron` (ukończona cała lista).

Dźwięki (`start`, `koniec`, `poziom`, `kompakt`, `kula`, `shenron`) są wygenerowane lokalnie w ComfyUI (efekty: Stable Audio Open, motyw Shenrona: ACE-Step 1.5) i lekko obrobione (filtr, nasycenie, krótki pogłos). Nie używają niczyich nagrań. Stable Audio Open ma własną licencję (Stability AI Community License): użycie komercyjne wymaga rejestracji u Stability AI, jeśli przychód przekracza ustalone w niej progi.

## Zasady latania Goku

1. Claude nie pracuje: Goku wisi w oddali i leniwie się unosi.
2. Claude pracuje (od startu do końca tury): Goku ruszy z miejsca, rozpędzi się w prawo, wyleci za krawędź, wróci z lewej i zahamuje.
3. Koniec tury: jednorazowy błysk Kamehameha.
4. `/aura-kinto`: lot ciągły.
5. Zebrane wszystkie smocze kule: w tle przepływa Shenron.
6. Ograniczenie ruchu w systemie: wszystko stoi w miejscu.

Goku nie śledzi kursora. Scena nie uruchamia skryptów, więc ruch jest zrobiony wyłącznie w CSS.

## Znane ograniczenia

- **Dźwięk:** według dokumentacji silnik odtwarza klipy przez systemowy odtwarzacz dostępny na macOS. Na Windows i Linuksie dźwięki mogą nie zagrać. Toasty działają zawsze.
- **Jedna scena naraz:** motyw przyjmuje jedną scenę, więc mod podmienia ją po zmianie pory dnia albo po `/tlo-kinto`. Odświeża się przy najbliższym przerysowaniu tła.
- **Limit sceny:** SVG tła może mieć 131 072 znaki. Mozaika (176×84 komórek), Goku i dodatki zajmują ok. 125 tys. na każdej z trzech scen, więc zapas jest niewielki.
- **Smocze kule:** liczą się z wywołań narzędzia listy zadań (`mcp__ccd_turn__update_plan`) w aplikacji desktopowej. W innych klientach lista może wyglądać inaczej i kule się nie zapalą.
- **Rozdzielczość tła:** jest mozaiką z lekkim rozmyciem, więc wygląda malarsko, nie fotograficznie.

## Struktura

```
.claude-plugin/plugin.json        manifest pluginu
.claude-plugin/marketplace.json   marketplace jednego pluginu
hooks/register.tsx                cała logika: kolory, scena, zdarzenia, pasek
hooks/make-colors.js              generator motywu (z narzędzi pluginów)
hooks/tlo-svg.ts                  tło dzienne (zachód) jako mozaika SVG
hooks/tlo-noc-svg.ts              tło zmierzchu jako mozaika SVG
hooks/tlo-gwiazdy-svg.ts          tło gwiaździstej nocy jako mozaika SVG
hooks/goku-svg.ts                 Goku na Kinto-un jako wektorowy obrys
hooks/shenron-svg.ts              głowa Shenrona jako wektorowy obrys (ciało rysuje register.tsx)
sounds/                           krótkie dźwięki zdarzeń
types/index.d.ts                  kontrakt stanu pluginu
```

## Rozwój

Walidacja pluginu:

```bash
claude plugin validate F:/dev/calude-kinto-mode
```

`hooks/tlo-svg.ts` i `hooks/goku-svg.ts` są generowane z obrazków. Jeśli podmienisz grafiki, zadbaj, żeby łączny rozmiar sceny nie przekroczył limitu z sekcji o ograniczeniach.

## Licencja

MIT. Dragon Ball jest własnością swoich twórców. To fanowski motyw, bez oficjalnych grafik i dźwięków.

## Nazwa pluginu

Plugin nazywa się `goku`: pod tą nazwą pojawia się w powiadomieniach i w komunikatach o przeładowaniu. Marketplace w tym repozytorium nazywa się `kinto-mode`, więc pełna nazwa do instalacji to `goku@kinto-mode`.
