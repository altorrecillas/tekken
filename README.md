# Puños de Barrio — Torneo de los amigos

Juego de lucha 3D al estilo Tekken 3 que se ejecuta en el navegador (WebGL2 + Three.js r186).
Los seis luchadores se han generado a partir de las fotos de esta carpeta: Alejandro, Arnau, Camilo, Rafa, Zapponi y Dani.

## Cómo jugarlo

El juego tiene que servirse por HTTP; abrir `index.html` como fichero no funciona.

```bash
cd tekken
python3 -m http.server 8000
# abre http://localhost:8000/ en Chrome, Edge o Firefox
```

- La calidad se elige en **Opciones** o por URL: `?q=low|medium|high|ultra`. Si no eliges ninguna, el juego usa `high` en ordenador, `medium` en tablet y `medium` o `low` en móvil (según la memoria del dispositivo).
- En la calidad `high` y superior se activan MSAA, GTAO, reflejos planos en la piscina y sombras en cascada de 2×2048.
- La resolución interna se ajusta sola para mantener unos 60 fps. Para fijarla, añade `?nodynres=1`.

### En el móvil o la tablet

- El juego se adapta a la pantalla: se juega en horizontal y, en vertical, pide girar el móvil (el combate se pausa solo).
- Al tocar la primera opción del título, el juego pasa a pantalla completa y bloquea la orientación horizontal (Android y iPad).
- En el iPhone, Safari no permite pantalla completa ni vibración a una web. Para jugar a pantalla completa, usa **Compartir → Añadir a pantalla de inicio**: el juego es una PWA (`manifest.webmanifest`) y se abre como una app.
- Los personajes se cargan bajo demanda: el título aparece tras descargar unos 27 MB y el resto se descarga en segundo plano. Las texturas se limitan a 1024 px en móvil y a 2048 px en tablet para no agotar la memoria de la GPU.
- Si el móvil se bloquea o cambias de app, el combate se pausa y el audio se suspende.

### Publicarlo en Internet

Es una web estática: vale cualquier hosting con HTTPS (GitHub Pages, Netlify, Cloudflare Pages o un servidor propio). El HTTPS hace falta para poder instalarla como app en el móvil.

- **GitHub:** ejecuta `bash subir_a_github.sh` en esta carpeta. El script te pregunta a qué repositorio subirlo (o crea uno nuevo), hace el commit a tu nombre, lo sube y, si quieres, lo publica con GitHub Pages. Así se puede jugar desde `https://<tu-usuario>.github.io/<repositorio>/`.
- Las mallas de los personajes se sirven comprimidas (`mesh.bin.gz`, unos 17 MB en total en vez de unos 40 MB). El juego las descomprime en el navegador, así que no hay que configurar nada en el servidor. Si cambias un personaje, `tools/pipeline/buildchar.py` vuelve a generar el `.gz`; también puedes regenerarlos todos con `bash tools/precompress.sh`.
- `.gitignore` deja fuera la carpeta `_sin_usar/` (ficheros que el juego no usa; se puede borrar) y las fotos originales de los luchadores.

## Modos

| Modo | Descripción |
|---|---|
| Arcade | Te enfrentas a los otros cinco, uno tras otro (la pantalla de carga indica «COMBATE X DE 5»). Al vencerlos a todos eres **Campeón del barrio**. La CPU se endurece en cada combate y los escenarios se alternan. |
| Versus | Dos jugadores, con teclado o mandos. En la selección se elige escenario con **W/S** o con las flechas ◀ ▶. |
| Entrenamiento | Rival pasivo. En pantalla se ve el estado del rival y la ventaja en frames de cada golpe. |

**Dificultad** (menú principal, se recuerda entre partidas): **Fácil**, **Normal** o **Difícil**. Fija el nivel de la CPU en cada uno de los cinco combates del arcade.

## Escenarios

- **Azotea al atardecer**: terraza con piscina, palmeras y el pueblo iluminándose frente al mar.
- **La Meta 10K**: la meta de una carrera popular en una avenida, con arco hinchable, reloj de carrera, público animando y una plaza.
- **El Porche**: una calle real del barrio, sacada de una foto: la planta baja es la foto limpia (sin interfaz de mapas, personas ni número de portal), con las persianas llenas de grafitis, las columnas de piedra y un aparcamiento cubierto con profundidad real, fluorescentes (uno parpadea) y la barrera amarilla y negra. Encima, ventanales industriales y una marquesina de hormigón. Día nublado, plátanos de sombra, farolas y contenedores. Los edificios vecinos y los de enfrente reutilizan trozos de la foto en sus plantas bajas.

## Controles

| Acción | Jugador 1 (teclado) | Jugador 2 (teclado) | Mando |
|---|---|---|---|
| Moverse / saltar / agacharse | W A S D | Flechas | Stick / cruceta |
| 1 · puño izquierdo | U | Num 4 / 7 | X / □ |
| 2 · puño derecho | I | Num 5 / 8 | Y / △ |
| 3 · patada izquierda | J | Num 1 / 9 | A / ✕ |
| 4 · patada derecha | K | Num 2 / 0 | B / ○ |
| Pausa y lista de movimientos | Enter / Esc | Num Enter | Start |
| Atajos | — | — | L1 = 1+2 · R1 = 3+4 · L2 = agarre 1+3 · R2 = agarre 2+4 |

### Controles táctiles

En móvil y tablet aparecen controles en pantalla durante el combate, con la disposición de los juegos de lucha para móvil:

- **Joystick a la izquierda:** aparece donde apoyas el pulgar, en cualquier punto de la mitad izquierda. Tiene 8 direcciones con zona muerta, y las diagonales se mantienen estables (agacharse bloqueando, abajo-adelante + 2). Los dashes y las esquivas se hacen con toques rápidos, igual que con la cruceta.
- **Botones 1 2 / 3 4 a la derecha:** en la disposición de la recreativa (puños arriba, patadas abajo), girados para seguir el arco del pulgar. El hueco entre dos botones pulsa los dos a la vez (1+2, 3+4, 1+3 y 2+4). Se puede deslizar el pulgar de un botón a otro.
- **RAGE ART:** botón que solo aparece cuando tienes furia (equivale a 1+2+3+4).
- **II:** pausa y lista de movimientos, bajo el reloj.
- Cada pulsación se ilumina y, en Android, vibra un poco.
- En **Opciones → Controles táctiles** se puede elegir cuándo mostrarlos (automático, siempre o nunca), el tamaño, la opacidad, el tipo de joystick (flotante o fijo) y la vibración.
- Si conectas un mando, los controles táctiles se ocultan solos.

### Reglas básicas

- **Bloqueo:** mantén *atrás* para bloquear golpes altos y medios; *abajo-atrás* bloquea los bajos.
- **Esquiva lateral:** toca *arriba* o *abajo*. **Dash:** pulsa *adelante* dos veces.
- **Agarre:** 1+3 (o 2+4, que es distinto según el luchador). Para zafarte, pulsa 1 o 2 en el momento del agarre.
- **Lanzador:** abajo-adelante + 2. Después puedes hacer un combo aéreo, con daño escalado.
- **Recuperación (tech):** pulsa cualquier botón justo al tocar el suelo. Te levantas al instante rodando hacia atrás, invulnerable, y evitas los golpes al suelo.
- **Counter hit:** golpea al rival mientras está atacando.
- **Rage:** con poca vida entras en Rage (más daño). Con 1+2+3+4 lanzas el **Rage Art**, una secuencia cinemática.

### Estilos

| Luchador | Apodo | Estilo | Movimientos propios |
|---|---|---|---|
| Alejandro | El Tatuado | Kickboxer rápido y preciso | b+4 patada giratoria · f+3 rodillazo · 1+2 combo tatuado |
| Arnau | El Gamer | Joven e impredecible | 1+2 cabezazo · df+4 barrida deslizante · b+2 martillo |
| Camilo | El Maratoniano | Mucho alcance y resistencia | f,f+4 patada a la carrera · 3+4 patada voladora · b+1 revés |
| Rafa | El Veterano | Peso pesado, golpes lentos y devastadores | 1+2 panzazo · f+2 mazazo |
| Zapponi | El Toro | Fuerza bruta; su lariat y su hachazo tienen *power crush* (aguantan golpes altos y medios mientras cargan) | 1+2 lariat · f+2 / f+1+2 hachazo · 2+4 suplex |
| Dani | El Zorro Plateado | Boxeador veterano de la vieja escuela, rápido de manos; el puñetazo gacela sale agachado y esquiva los golpes altos | b+1 gancho al hígado · d+2 puñetazo gacela (lanza) · 1+2 guantazo |

La lista completa de movimientos está en el menú de pausa. Al ganar, cada luchador suelta una de sus frases («Más sabe el zorro por viejo que por zorro», «¡Nadie para al Toro!»…).

## Tecnología

- **Render:** PBR de Three.js con cadena HDR: MSAA, GTAO, bloom, profundidad de campo en las cinemáticas y un pase final con tonemapping AgX, grading CDL por escenario, viñeta y grano.
  - Sombras solares en dos cascadas: una fina que sigue a los luchadores y otra amplia para el escenario (`js/engine/sunshadow.js`).
  - Una luz principal y un contraluz que solo afectan a los personajes (`FIGHTER_KEY`).
  - Sombras de contacto bajo los pies y reflejos planos en la piscina.
- **Personajes:** malla base de MakeHuman (CC0), ajustada a las fotos.
  - Landmarks faciales con MediaPipe y ajuste de cámara en perspectiva, más campos RBF para la cara.
  - Textura facial proyectada desde la foto, con eliminación de gafas, corrección de color y costura del cuello igualada.
  - Pelo con *hair cards* en dos pasadas (con canas mezcladas en el caso de Rafa) y barba con *fur shells*.
  - Ropa como capas skinned con pliegues y relajación del tejido. Accesorios procedurales: gafas, relojes, pulseras y la medalla de finisher.
- **Animación:** rig IK propio y claves procedurales para cada golpe, con muelles de inercia en torso y cabeza, parpadeo y cierre de ojos en los golpes y KO.
  - **Pies anclados al suelo** (`js/anim/feet.js`): un pie apoyado se queda fijo en el mundo aunque el cuerpo avance, gire o reciba empuje, y da un paso procedural (con arco y suavizado) cuando se queda atrás. Si la pierna no llega, el pie se pone de puntillas en vez de flotar.
  - **Transiciones con inercia**: al cambiar de animación, la diferencia de postura y su velocidad se amortiguan con un muelle crítico, en lugar de fundir desde una pose congelada; el cuerpo conserva su impulso.
  - Guardia que se cierra en el cuerpo a cuerpo, manos que no atraviesan la cara ni el torso, y curvas de golpe con arranque progresivo y retroceso rápido.
  - Espaciado del tronco: si al lanzar un golpe el torso se inclina hacia un rival muy cercano, la cabeza y el pecho se corrigen hacia atrás en vez de atravesarle.
  - **Volúmenes corporales** (`js/anim/body.js`): cápsulas ajustadas a la malla de cada luchador (elípticas en torso y cabeza, redondas en las extremidades, barriga incluida). Con ellas:
    - las manos, codos y pies no atraviesan el propio cuerpo;
    - los golpes se detienen en la superficie del rival;
    - los brazos rodean el cuerpo del rival en los agarres;
    - las manos apoyadas descansan sobre el suelo.
  - IK suave (el brazo o la pierna nunca se estira de golpe hasta el límite), rodillas y codos con giro estable, límites de tobillo, codo y rodilla, y un filtro anti-saltos críticamente amortiguado en los canales de la pose.
  - **Agarres coreografiados** (`js/fight/throws.js`): cada agarre define la trayectoria de la víctima respecto a quien agarra, dónde se sujeta cada mano (hueso del rival + desfase) y los impactos. Rodillazos, abrazo del oso con levantamiento y suplex por encima de la cabeza; la distancia se ajusta al tamaño del torso de cada pareja.
  - Reacciones propias para cada caso: golpe alto, medio y bajo; lanzamiento; derribo; barrido (cae de espaldas como un bloque); aterrizaje y levantarse.
  - Máquina de estados de lucha a 60 Hz fijos, con hitstop, empuje, counters, juggles, agarres y knockdowns.
  - Ragdoll Verlet en los KO.
- **Público de La Meta 10K:** los propios luchadores, re-vestidos y posados, pre-renderizados en un atlas de 64 sprites (`crowdlab.html`) y dibujados con una sola llamada instanciada.
- **Audio:** golpes sintetizados con WebAudio; música, público y voces grabados.
  - **Música** en `assets/music/` (unos 10 MB, se reproduce en streaming, una pista a la vez): «Latin Industries» en los menús, «Exit the Premises» en la azotea, «Club Diver» en la calle y «MTA» en El Porche, de [Kevin MacLeod](https://incompetech.com) con licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Graves por debajo de 32 Hz recortados y volumen normalizado a −16 LUFS para que suene limpia también en el altavoz del móvil.
  - **Público de la calle** en `assets/sfx/`: un bucle de ambiente sin cortes y una ovación en cada K.O., de las [grabaciones de Gregor Quendel](https://opengameart.org/content/free-crowd-cheering-sounds) (CC BY 4.0). La azotea y El Porche solo llevan música.
  - Los créditos también aparecen en el menú de opciones.
  - **Locutor en español** con voz natural: frases pregrabadas en `assets/voice/` («Ronda uno», «¡A luchar!», «¡K.O.!», «¡Gana Rafa!»…), unos 230 KB en total.
  - Generadas con el sintetizador neuronal [Piper](https://github.com/rhasspy/piper) (voz `es_ES-davefx-medium`), con un ligero eco de pabellón.
  - La voz de davefx se entrenó con datos de dominio público (CC0), pero parte del modelo base *lessac*, con licencia de investigación: úsalas solo en un proyecto no comercial.
  - Si falta un clip, se usa la voz del propio dispositivo.
  - **Gritos de los luchadores** grabados por actores, en `assets/voice/fx/` (unos 820 KB). Cada luchador tiene su propia combinación de voz y tono, con variantes de ataque, dolor, golpe fuerte y K.O. que no se repiten dos veces seguidas.
    - Voces de [HaelDB](https://opengameart.org/content/male-gruntyelling-sounds) (CC0) y de VoiceBosch ([esfuerzos](https://opengameart.org/content/effort-sounds-male-audio-pack) y [daño](https://opengameart.org/content/damage-sounds-male-audio-pack), CC-BY-SA 4.0).
    - Créditos y licencias en `assets/voice/fx/CREDITS.txt`.
- **Móvil y producción** (`js/engine/device.js`, `js/ui/touch.js`):
  - El perfil del dispositivo (móvil, tablet u ordenador; memoria) fija la calidad por defecto, el límite de *pixel ratio* y el tamaño máximo de textura.
  - Carga diferida de personajes con precarga en segundo plano, y mallas comprimidas con gzip que se descomprimen con `DecompressionStream`.
  - Las zonas seguras del notch se respetan con `env(safe-area-inset-*)`.
  - Pausa al perder el foco y recarga si el navegador pierde el contexto WebGL.
  - Pantalla de error si el navegador no tiene WebGL2.
  - PWA con iconos (también *maskable*), pantalla completa y orientación horizontal.
  - Para probar sin un móvil: `?device=phone|tablet|desktop` fuerza el perfil y `?texcap=1024` limita las texturas.

## Herramientas (carpeta `tools/`)

Son los scripts usados para generar los personajes y probar el juego. Se incluyen como referencia: para regenerar los personajes hacen falta los assets de MakeHuman y los modelos de MediaPipe, que no están en el repositorio.

- `tools/pipeline/`: pipeline de construcción de personajes en Python. El punto de entrada es `buildchar.py`; los parámetros de cada luchador están en `people.py` y la ropa en `outfits.py`.
- `tools/*.mjs`: capturas headless con Playwright (`shot.mjs`), pruebas de flujo de menús (`flow.mjs`, `flow2.mjs`), simulación de combates sin gráficos para equilibrar (`simtest.mjs` y `rr.sh`) y horneado del público (`crowdbake.mjs`). Las herramientas localizan el juego a partir de su propia carpeta; la variable `GAME_ROOT` permite apuntar a otra copia.
- Móvil:
  - `tools/mshot.mjs`: capturas con perfiles de móvil y tablet (844×390 @3x, 667×375 @2x, vertical, 1180×820 @2x).
  - `tools/mtouch.mjs`: prueba los controles táctiles con toques multitáctiles reales (menús, joystick, botones, pulsaciones dobles, deslizamientos, pausa, opciones); son 20 comprobaciones.
  - `tools/arcadetest.mjs`: juega el modo arcade completo (los cinco rivales, pantalla de carga «COMBATE X DE 5», banner de campeón y vuelta al menú) y comprueba que cada combate carga exactamente dos luchadores.
  - `tools/voicetest.mjs` y `tools/musictest.mjs`: cargan y reproducen todas las voces y gritos, y la música del menú y de los escenarios (cambios de pista, pausa al ocultar la página, público de la calle).
  - `tools/netaudit.mjs`: mide los bytes descargados hasta que el título responde y en una sesión completa, y lista los ficheros que nunca se piden.
  - `tools/perfprobe.mjs`: cuenta las llamadas de dibujo, los triángulos y la memoria de texturas de un combate con cada calidad.
- Páginas de laboratorio: `viewer.html` (personajes), `poselab.html` y `animlab.html` (poses y golpes), `fightlab.html` (tiras de fotogramas de combates guionizados sobre suelo cuadriculado), `lineup.html` (proporciones con regla), `stagelab.html` (escenarios) y `crowdlab.html` (público).
- Control de calidad de la animación (se ejecutan con `node --import ./register.mjs <herramienta>` desde `tools/`):
  - `animaudit.mjs`: la auditoría principal. Recorre todos los golpes de todos los luchadores contra dos rivales, más movimiento, agarres, Rage Arts, poses y combates de la IA, y usa los mismos volúmenes corporales que el rig. Informa de:
    - extremidades dentro del propio cuerpo o del rival;
    - partes bajo el suelo;
    - articulaciones fuera de rango (cuello, columna, cadera, rodilla, tobillo, codo, muñeca);
    - saltos bruscos de postura.
    Admite `--only moves|motion|throws|rage|poses|ai`, `--moves`, `--fighters`, `--json` y `--top`.
  - `posedump.mjs` + `posesheet.py`: hojas de contacto de las cápsulas (vista lateral, frontal y cenital) en segundos, para revisar un golpe sin renderizar.
  - `animtrace.mjs`: aceleración fotograma a fotograma de unos huesos, para localizar un salto.
  - `animqa.mjs`: deslizamiento de pies y saltos en combates simulados.
  - `rangeall.mjs`: alcance real de cada golpe de cada luchador; detecta golpes que nunca conectan.
  - `proportions.mjs` y `armcheck.mjs`: proporciones corporales frente a normas antropométricas.
- `fightlab.html?scn=...`: además de los escenarios básicos, tiene `punches`, `kicks`, `high`, `sweep`, `lunge`, `spin`, `throw1`, `throw2`, `special`, `fly`, `jumpk`, `hit` y `ai` (combate real entre dos IA, con `lvl=1..5` y `start=` para saltar fotogramas), con `dist=` y `noguard=1`.
