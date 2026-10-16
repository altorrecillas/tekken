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
| Versus → 2 jugadores | Dos jugadores en la misma pantalla, con teclado o mandos (en un móvil o tablet sin mando aparece atenuado: hace falta un mando). En la selección se elige escenario con **W/S** o con las flechas ◀ ▶. |
| Versus → Online | Dos jugadores, **cada uno en su móvil**, por WiFi (o por QR sin internet). Ver [Versus online](#versus-online-dos-móviles). |

Los dos versus están en el submenú **VERSUS** del menú principal.

**Versión:** el número de versión se ve en pequeño en la esquina inferior izquierda de los menús (por ejemplo «v0.68»). Así se sabe qué versión ha cargado cada móvil, porque GitHub Pages y los navegadores guardan los ficheros en caché un rato. Está en `js/version.js` y **hay que subirlo con cada cambio que se publique**. Dos móviles con versiones distintas no pueden jugar online juntos: el que se une recibe un aviso con las dos versiones.
| Entrenamiento | Rival pasivo. En pantalla se ve el estado del rival y la ventaja en frames de cada golpe. |

**Dificultad** (menú principal, se recuerda entre partidas): **Fácil**, **Normal** o **Difícil**. Fija el nivel de la CPU en cada uno de los cinco combates del arcade.

**Continuar (arcade):** el arcade se guarda solo en el dispositivo. Guarda la escalera de rivales, la dificultad y, a mitad de un combate, el combate exacto: ronda, vida, posiciones y reloj.
- **Cuándo se guarda:** cada 3 segundos de combate y siempre que el juego deja la pantalla (cambias de app, bloqueas el móvil o cierras la pestaña).
- **Al volver:** el primer botón del menú es **CONTINUAR** (por ejemplo «ARCADE · RAFA · 3/5»). El combate sigue donde estaba tras una cuenta atrás 3-2-1.
- En la pausa del arcade, **GUARDAR Y SALIR** vuelve al menú sin perder la partida.
- **Entre combates:** si has ganado, CONTINUAR pasa al siguiente rival; si has perdido, repite ese combate.
- **Cuándo se borra:** al ser campeón o al empezar un arcade nuevo.
- El Versus, el Entrenamiento y el modo online no se guardan.
- Si el juego se actualiza entre medias, el combate guardado empieza de nuevo, pero se conserva el progreso de la escalera.

## Versus online (dos móviles)

Cada jugador pelea desde su propio móvil (Android o iPhone), en la misma WiFi o en el punto de acceso de uno de ellos. No hace falta instalar nada ni ningún servidor propio. Está hecho a partir de la plantilla de `PlantillaWeb/plantilla/multijugador/` y de sus notas (`PlantillaWeb/notas/multijugador-wifi-qr.md`).

**Cómo se juega**

1. En los dos móviles: **VERSUS → ONLINE** en el menú principal. Cada uno escribe su nombre.
2. Uno pulsa **CREAR PARTIDA** y sale un código de 4 cifras. Al otro móvil, si está en la misma WiFi, **la partida le aparece sola** en «Partidas en esta WiFi». Si no, pulsa **UNIRSE CON CÓDIGO** y lo escribe.
3. **Sin internet:** **CREAR CON QR** en uno y **UNIRSE CON QR** en el otro. Cada móvil enseña un QR que el otro lee con la cámara. La cámara solo funciona con https (la web publicada, no `http://192.168…`).
4. El anfitrión elige las **reglas**: rondas para ganar (1, 2 o 3), tiempo (30, 60 o 99 s) y retardo de entrada (automático o de 1 a 4 fotogramas). Después pulsa **¡A LUCHAR!**.
5. Los dos eligen luchador en la misma pantalla y cada uno ve el cursor del otro en directo. El anfitrión elige el escenario.
6. Al acabar: marcador de la noche (y el historial contra ese rival), **REVANCHA**, **CAMBIAR LUCHADOR**, **▶ REPETICIÓN** del combate o **SALIR**.

**Durante el combate**

- Bajo el reloj está el **medidor de conexión**: barras y ping. Si lo tocas, muestra el retardo, la corrección media, las esperas y el estado de la sincronía.
- La **pausa es compartida**: si un jugador pausa, el combate se para en los dos móviles. Al continuar hay una cuenta atrás 3-2-1 en los dos. Desde la pausa se puede abandonar el combate (lo gana el rival).
- Si la WiFi se corta o el otro móvil se atasca un momento, el combate lo absorbe. Si el parón pasa de un segundo, sale el aviso «Esperando a…». Si se pierde la conexión y la partida es con código, el móvil invitado vuelve solo a su sitio y el combate sigue donde estaba. Con QR no hay vuelta atrás.
- En el móvil, el gesto **atrás** pide confirmación: hay que hacerlo dos veces para salir de la partida. La pantalla no se apaga mientras se juega.
- Tu luchador lleva la marca **TÚ** bajo la barra de vida y, en el móvil, los golpes fuertes que recibes se notan con una vibración (si la tienes activada en Opciones).

**Cómo funciona (netcode rollback)**

Es el sistema de los juegos de lucha grandes (GGPO: Street Fighter 6, Tekken 8…):

- **Los dos móviles simulan el combate entero.** Por la red solo viajan los mandos: 2 bytes por fotograma y jugador.
- Tus golpes se ejecutan al instante, con un retardo fijo de 1 o 2 fotogramas. En **AUTO**, el retardo se calcula según el ping.
- Para los fotogramas cuyo mando del rival aún no ha llegado, el juego **predice** que sigue haciendo lo mismo. Puede ir hasta 18 fotogramas (300 ms) por delante antes de esperar. Los móviles se atascan más que un ordenador (al recoger basura de memoria o subir una textura), y así el combate no se para por un tirón de la WiFi o del otro móvil.
- Si un móvil se atasca, en cuanto vuelve recupera de golpe los fotogramas que le faltan, en vez de obligar al otro a esperarle. Con tirones simulados de 150 a 450 ms, el otro móvil pasó de estar parado 6,4 s cada dos minutos a 1,4 s.
- Los efectos (chispas, polvo, estelas) se preparan ocultos mientras carga el combate. Antes, la primera vez que salían, el móvil compilaba sus shaders a mitad de pelea y daba un tirón.
- Durante el combate online, la resolución dinámica solo baja, nunca sube: cada cambio reconstruye los búferes de imagen y es otro tirón. Vuelve a subir entre combates.
- Cada fotograma se guarda (unos 30 µs). Si el mando real del rival era otro, el combate **retrocede** a ese fotograma y lo vuelve a jugar en el mismo refresco de pantalla. Con una WiFi normal son correcciones de 1 o 2 fotogramas, invisibles.
- El móvil que va por delante frena un poco hasta que los dos juegan el mismo fotograma a la vez.
- Cada medio segundo los dos comparan una huella del estado. Si alguna vez no coincidieran (por un error, o porque dos navegadores redondean distinto un seno), el móvil invitado toma el estado del anfitrión y sigue.
- La simulación es **determinista**: no depende del azar, ni de la cámara de cada móvil, ni de cuántos fotogramas por segundo dibuje. Por eso la repetición del combate sale exacta.
- Los efectos (chispas, sonidos, rótulos) de un fotograma que se vuelve a jugar no se repiten.

**Versión:** los dos móviles tienen que tener la misma versión del juego. Si no, el que se une recibe un aviso para recargar la página. La versión de red (`js/net/config.js`) es la del juego (`js/version.js`) más una huella de los movimientos de todos los luchadores. **Con cada cambio, sube la versión en `js/version.js`.**

**Límites**

- El código y la búsqueda en la WiFi usan el servidor gratuito de PeerJS solo para presentar a los dos móviles; después todo va directo de móvil a móvil. Si ese servidor falla, el QR sigue funcionando.
- Las WiFi con aislamiento de clientes (de invitados, de hoteles) no dejan que los móviles se vean. Con código puede funcionar por el relé TURN (más lento). Si no, usad el punto de acceso de uno de los móviles.
- **Todavía no se ha probado con móviles de verdad.** Está probado con navegadores en el ordenador (Chromium hace de Android y WebKit de iPhone), con el servidor de códigos de prueba y también con el servidor real de PeerJS (16/10/2026). Antes de dar por buena una versión, echad una partida real con dos móviles: misma WiFi, código, QR sin datos, Android contra iPhone y un móvil que bloquea la pantalla a mitad de combate.

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
- **Online** (`js/net/`, `js/ui/online.js`): netcode rollback propio (`rollback.js`), con estado del combate guardado y restaurado en un búfer plano (`simstate.js`). La conexión WebRTC, el servidor de códigos, la búsqueda en la misma WiFi y los QR vienen de la plantilla de PlantillaWeb (`netplay.js`, `link.js`, `signal.js`, `lan.js`, `sdp.js`, `qr.js`).
  - QR: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) para dibujarlos y [jsQR](https://github.com/cozmo/jsQR) (Apache 2.0, licencia en `vendor/qr/LICENSE-jsQR`) para leerlos donde el navegador no tiene `BarcodeDetector`.
  - Presentación de los móviles (código y WiFi): servidor público gratuito de [PeerJS](https://peerjs.com).
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
  - `tools/continuetest.mjs [salida]`: el «continuar» del arcade. Simula que el juego pasa a segundo plano a mitad de combate y se cierra. Comprueba que al volver aparece CONTINUAR, que el combate sigue exactamente igual (fotograma, vida, posiciones, reloj y rival), la cuenta atrás, el guardado solo cada pocos segundos, GUARDAR Y SALIR, el paso al siguiente rival y el borrado al ser campeón.
  - `tools/voicetest.mjs` y `tools/musictest.mjs`: cargan y reproducen todas las voces y gritos, y la música del menú y de los escenarios (cambios de pista, pausa al ocultar la página, público de la calle).
  - `tools/netaudit.mjs`: mide los bytes descargados hasta que el título responde y en una sesión completa, y lista los ficheros que nunca se piden.
  - `tools/perfprobe.mjs`: cuenta las llamadas de dibujo, los triángulos y la memoria de texturas de un combate con cada calidad.
- Modo online (ver [Versus online](#versus-online-dos-móviles)):
  - `node --import ./register.mjs netsim.mjs`: sin navegador. Comprueba que las mismas entradas dan el mismo combate bit a bit y que más de 5000 retrocesos aleatorios se rejuegan exactos. También que una copia del estado por la red sigue igual. Usa 4 parejas de luchadores, con agarres, Rage Arts, KO y fin del combate.
  - `netsim.mjs --only session` (con `netsession.mjs`): dos sesiones de rollback unidas por una red simulada. Las situaciones son WiFi buena, WiFi cargada, móvil lento, red mala con un 20 % de pérdida, una desincronización forzada y un móvil que se atasca de 150 a 450 ms de vez en cuando (con los ajustes de antes y con los de ahora).
    - En todas acaban en el mismo estado, que es el del combate sin red.
    - La desincronización forzada se corrige sola.
    - Con los tirones, el otro móvil no llega a ver el aviso «Esperando a…» y pasa menos de 2,5 s parado cada dos minutos.
  - `netflow.mjs [salida] [chromium|webkit] [wifi|code]`: dos navegadores de principio a fin. Prueba la partida encontrada sola en la «WiFi» (o el código), los nombres, las reglas y la selección sincronizada. Después el combate con rollback y sus comprobaciones de estado, la pausa compartida, un corte de WiFi con vuelta sola y el final. Por último, la repetición (que acaba exactamente igual), la revancha y la salida de un jugador. Con `webkit`, el invitado usa el motor del iPhone.
  - `netqr.mjs [salida]`: sin internet, por QR, con la cámara falsa de Chromium leyendo el QR del otro móvil. Comprueba también que un QR de otro juego o de otra versión se rechaza, el combate y el aviso al perder la conexión.
  - `mocksignal.mjs`: servidor de códigos de prueba (imita al de PeerJS) para que las pruebas no dependan de internet. Las páginas lo usan con `?sig=ws://localhost:PUERTO/peerjs`. Con `?lankey=testnet` todas las páginas están en la misma «WiFi», y `?netdebug=1` saca mensajes `[net]` en la consola.
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
