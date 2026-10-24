# Puños de Barrio — Torneo de los amigos

Juego de lucha 3D al estilo Tekken 3 que se ejecuta en el navegador (WebGL2 + Three.js r186).
Los siete luchadores se han generado a partir de las fotos de esta carpeta: Alejandro, Arnau, Camilo, Rafa, Zapponi, Dani y Noemí.

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
- Las mallas de los personajes se sirven **cuantizadas** y comprimidas (`mesh.bin.gz`, unos 13 MB los siete luchadores; antes eran 26 MB). Las posiciones van en enteros de 16 bits dentro de la caja de cada pieza (unos 0,03 mm de precisión) y las normales, UV, pesos, colores y tangentes en enteros pequeños. Comparado píxel a píxel con las mallas originales, no hay diferencia visible. El juego las descomprime y las decodifica en el navegador (`js/charloader.js`), así que no hay que configurar nada en el servidor. Si cambias un personaje, `tools/pipeline/buildchar.py` las vuelve a generar ya cuantizadas, con su `.gz`; `bash tools/precompress.sh` regenera todos los `.gz`.
- **Carga escalonada:** la primera pantalla solo espera al código, al escenario y a los datos pequeños de los menús (unos 6 MB): el título sale sobre El Porche vacío y los dos luchadores del fondo entran andando en cuanto llegan; el resto de la plantilla se descarga después, de uno en uno, sin bloquear nada. Antes había que bajar unos 27 MB (todos los luchadores del fondo y sus texturas) antes de ver el título. La pantalla de carga se ve desde el primer instante: el logo con una fuente de reserva mientras llega la suya, una barra que se mueve mientras baja el código y luego el progreso real, y una línea con lo que se está preparando.
  - Las fuentes van en WOFF2 con solo los caracteres que usa el juego (11 KB cada una en vez de 60–400 KB en TTF).
  - Las texturas compartidas (mechones de pelo, ojos, dientes, pestañas) van en WebP: una décima parte del PNG, con la transparencia exacta. El pipeline sigue escribiendo los PNG como fuente y genera los WebP.
  - Los shaders se compilan antes del primer fotograma (`compileAsync`, en paralelo donde la GPU lo permite).
  - `index.html` pide todos los módulos de una vez (`<link rel="modulepreload">`) en vez de descubrirlos import a import. Si añades, quitas o renombras un módulo, ejecuta `python3 tools/preloads.py` para regenerar la lista.
  - Cada luchador se descarga un 30 % más ligero que en la versión 0.70 (de 35 a 25 MB los siete): las mallas guardan cada dato como diferencia con el vértice anterior y con los bytes agrupados por importancia (lo que mejor comprime en cada caso), y la cabeza ya no repite los vértices del cuerpo (un 34 % menos de malla, idéntica al decodificarla; en la tarjeta gráfica cabeza y cuerpo comparten esos datos); las texturas, con el fondo de sus islas relleno de forma suave, comprimen mucho mejor (de 22 a 15 MB). En una red de móvil de 20 Mbps, entrar en un combate tarda algo más de un segundo menos.
- `.gitignore` deja fuera la carpeta `_sin_usar/` (ficheros que el juego no usa; se puede borrar) y las fotos originales de los luchadores.

## Modos

| Modo | Descripción |
|---|---|
| Arcade | Te enfrentas a los otros seis, uno tras otro (la pantalla de carga indica «COMBATE X DE 6»). Al vencerlos a todos eres **Campeón del barrio** y ves el **final** de tu luchador. La CPU se endurece en cada combate y los escenarios se alternan. |
| Versus → 2 jugadores | Dos jugadores en la misma pantalla, con teclado o mandos (en un móvil o tablet sin mando aparece atenuado: hace falta un mando). En la selección se elige escenario con arriba / abajo (**W/S** o las flechas) o con las flechas ◀ ▶. |
| Versus → Online | Dos jugadores, **cada uno en su móvil**, por WiFi (o por QR sin internet). Ver [Versus online](#versus-online-dos-móviles). |

Los dos versus están en el submenú **VERSUS** del menú principal.

**Versión:** el número de versión se ve en pequeño en la esquina inferior izquierda de los menús (por ejemplo «v0.74»). Así se sabe qué versión ha cargado cada móvil, porque GitHub Pages y los navegadores guardan los ficheros en caché un rato. Está en `js/version.js` y **hay que subirlo con cada cambio que se publique**. Dos móviles con versiones distintas no pueden jugar online juntos: el que se une recibe un aviso con las dos versiones.
| Entrenamiento | Sparring configurable, grabación del rival, historial de entradas y pruebas de combo. Ver [Entrenamiento](#entrenamiento). |

**Dificultad** (menú principal, se recuerda entre partidas): **Fácil**, **Normal** o **Difícil**. Fija el nivel de la CPU (de 1 a 5) en cada uno de los seis combates del arcade:

| Dificultad | Niveles de la CPU, combate a combate |
|---|---|
| Fácil | 1 · 1 · 2 · 2 · 3 · 3 |
| Normal | 2 · 2 · 3 · 3 · 4 · 4 |
| Difícil | 3 · 4 · 4 · 5 · 5 · 5 |

- En los niveles bajos la CPU se cubre poco: a menudo avanza con la guardia bajada en vez de esperar quieta (quedarse quieto ya bloquea los golpes altos y medios), deja entrar las series de golpes, apenas castiga y casi no hace combos aéreos ni Rage Arts. En los altos se cubre, castiga los golpes bloqueados y remata en el aire.
- Medido con `tools/diffbench.mjs` (un jugador novato simulado contra la CPU): gana ocho de cada diez asaltos contra el nivel 1, siete contra el 2, casi seis contra el 3, algo más de tres contra el 4 y menos de dos contra el 5. Antes ganaba cuatro de cada diez contra el nivel 1 y poco más de uno contra el 3.
- El nivel del compañero de **Entrenamiento** (acción CPU) usa la misma escala.

**Resultados y JUGADA DEL COMBATE:** al acabar cada combate (arcade, versus y online) sale una pantalla con los datos de los dos: golpes, daño, mejor combo, contraataques, lanzamientos, agarres, bloqueos y Rage Arts, y la jugada del combate (por ejemplo «COMBO DE 5 GOLPES · 78 DE DAÑO · K.O.»).
- **▶ VER JUGADA** la repite a cámara lenta, con letterbox, sus efectos y sus sonidos. Es exactamente lo que pasó: el combate es determinista, así que se vuelve a simular desde una instantánea guardada justo antes, con las mismas pulsaciones.
- La jugada se elige por puntuación: el daño, la longitud del combo, y si tuvo lanzamiento, contraataque, Rage Art, agarre o K.O. (más si fue el K.O. final o una ronda perfecta).
- En el arcade, entre combate y combate, el botón principal es **SIGUIENTE COMBATE**.

**Trajes:** en la selección de luchador cada uno tiene un **segundo traje** de otros colores (Q / E con el teclado del jugador 1, − / = el jugador 2, mientras no se hayan asignado a una acción; L1 / R1 con mando, o las flechas ◀ ▶ del panel). Si los dos eligen al mismo luchador con el mismo traje, el segundo jugador sale con el otro, para distinguirlos. El **traje de campeón** (dorado y negro) se desbloquea al ganar el arcade con ese luchador. Online, cada móvil ve el traje que ha elegido el otro.

**EXTRAS** (menú principal):
- **LOGROS:** 21 logros, por ejemplo primera victoria, campeón del barrio, ronda perfecta, combo de 5 y de 7 golpes, remates con Rage Art, contraataque o agarre, remontada, 500 golpes, todos los escenarios, ganar online o completar las pruebas de combo. Al desbloquear uno aparece un aviso arriba a la derecha.
- **FINALES:** los finales del arcade desbloqueados, para volver a verlos.
- **CABEZONES:** cabezas grandes (solo de aspecto; los golpes miden la cabeza real). Se desbloquea al ganar el arcade.
- **CONTROLES:** la ayuda de controles, con las teclas y los botones tal como los tenga cada jugador, y **CONFIGURAR** para cambiarlos (ver [Cambiar los controles](#cambiar-los-controles)).
- Todo se guarda en el dispositivo.

**Continuar (arcade):** el arcade se guarda solo en el dispositivo. Guarda la escalera de rivales, la dificultad y, a mitad de un combate, el combate exacto: ronda, vida, posiciones y reloj.
- **Cuándo se guarda:** cada 3 segundos de combate y siempre que el juego deja la pantalla (cambias de app, bloqueas el móvil o cierras la pestaña).
- **Al volver:** el primer botón del menú es **CONTINUAR** (por ejemplo «ARCADE · RAFA · 3/5»). El combate sigue donde estaba tras una cuenta atrás 3-2-1.
- En la pausa del arcade, **GUARDAR Y SALIR** vuelve al menú sin perder la partida.
- **Entre combates:** si has ganado, CONTINUAR pasa al siguiente rival; si has perdido, repite ese combate.
- **Cuándo se borra:** al ser campeón o al empezar un arcade nuevo.
- El Versus, el Entrenamiento y el modo online no se guardan.
- Si el juego se actualiza entre medias, el combate guardado empieza de nuevo, pero se conserva el progreso de la escalera.

## Entrenamiento

- **AJUSTES DE ENTRENAMIENTO** (en la pausa):
  - **Rival:** de pie (no bloquea), agachado, salta, CPU (nivel 1 a 5) o repite tu grabación.
  - **Bloqueo:** no, todo (los bajos agachado) o aleatorio.
  - **Castiga tras bloquear:** responde con su golpe más rápido.
  - **Se recupera rodando:** al caer.
  - **Historial de entradas:** en pantalla, con dirección, botones y frames que se mantuvo cada entrada.
- **Grabar al rival:** pulsa **R** (o el botón en los ajustes). Tras una cuenta atrás manejas tú al rival hasta 10 segundos. Pulsa **R** para terminar y el rival repite lo grabado en bucle. **P** para la reproducción o la reanuda.
- **Pruebas de combo:** cinco por luchador, de la más fácil a la más difícil (uno-dos, cadenas, lanzamiento y combo aéreo, su golpe estrella). Arriba a la derecha se ve la secuencia y se marca cada golpe que entra. **T** pasa a la siguiente. El progreso se guarda y cuenta para los logros. `tools/trainingtest.mjs` comprueba que todas se pueden hacer.
- En la pantalla se siguen viendo el estado del rival y la ventaja en frames de cada golpe.

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

El escenario principal es **El Porche**: en él están el título y la pantalla de selección, es el que viene elegido por defecto y el del primer combate del arcade (que recorre los demás en este orden).

Cada escenario suena distinto: tiene su propio estilo de música, con varias canciones que se van turnando (cada combate empieza con la siguiente y, si una termina, entra otra), y una más fuerte para la ronda decisiva, cuando a los dos les falta un asalto para ganar. Funk y hip hop urbano en El Porche, disco latino y salsa en la azotea, rock en la meta de la carrera y música de discoteca en el festival. Los golpes, además, resuenan en el espacio de cada sitio (la calle estrecha y los soportales de El Porche, la azotea abierta, los edificios altos de la avenida, la concha del escenario del festival).

- **El Porche**: una calle real del barrio, sacada de una foto: la planta baja es la foto limpia (sin interfaz de mapas, personas ni número de portal), con las persianas llenas de grafitis, las columnas de piedra y un aparcamiento cubierto con profundidad real, fluorescentes (uno parpadea) y la barrera amarilla y negra. Encima, ventanales industriales y una marquesina de hormigón. Día nublado, plátanos de sombra, farolas y contenedores. Los edificios vecinos y los de enfrente reutilizan trozos de la foto en sus plantas bajas.
- **Azotea al atardecer**: terraza con piscina, palmeras y el pueblo iluminándose frente al mar.
- **La Meta 10K**: la meta de una carrera popular en una avenida, con arco hinchable, reloj de carrera, público animando y una plaza.
- **El Festival**: el escenario al aire libre de las fiestas del barrio, al atardecer, a partir de una foto. La concha del escenario con su pantalla LED, las torres con lonas, el cartel de la cabina del DJ, la tarima de madera, el cañizo, los pinos y el hormigón de la plaza salen de la foto, limpia: sin la chica de blanco, sin la gente del escenario ni el vigilante, sin la fecha, y con la marca de ron de las lonas cambiada por «PUÑOS DE BARRIO» (`tools/festival_prep.py`). Alrededor, en 3D: la tarima con barandillas de andamio, la cabina con los platos, torres de luces, la carpa del técnico de sonido, una barra, un food truck, guirnaldas de bombillas, focos móviles que barren a ritmo de música y público bailando. Las barras de luz, la pantalla y el público siguen el compás de la canción que suena (su tempo y su primer pulso medidos en cada pista).

## Controles

Los controles de fábrica (todos se pueden cambiar, ver más abajo):

| Acción | Jugador 1 (teclado) | Jugador 2 (teclado) | Mando |
|---|---|---|---|
| Moverse / saltar / agacharse | W A S D | Flechas | Stick / cruceta |
| 1 · puño izquierdo | U / Y | Num 4 / 7 | X / □ |
| 2 · puño derecho | I | Num 5 / 8 | Y / △ |
| 3 · patada izquierda | J / H | Num 1 / 9 | A / ✕ |
| 4 · patada derecha | K | Num 2 / 0 | B / ○ |
| Pausa y lista de movimientos | Enter (y siempre Esc) | Num Enter / Retroceso | Start / Options |
| Atajos | se pueden asignar | se pueden asignar | L1 = 1+2 · R1 = 3+4 · L2 = agarre 1+3 · R2 = agarre 2+4 |

En los menús, cada jugador usa sus propias teclas: sus direcciones para moverse, su **1** para aceptar y su **4** para volver. Intro y Espacio también aceptan, y Esc y Retroceso vuelven, mientras no se hayan asignado a una acción de combate. Con mando, ✕ / A (o □ / X) acepta y ○ / B vuelve, se hayan cambiado o no los botones del combate.

### Cambiar los controles

En **Opciones → Teclado y mando → CONFIGURAR**, en **Extras → Controles → CONFIGURAR** o en la **pausa → CONTROLES** (en el ordenador o con mando):

- Tres pestañas: **TECLADO · J1**, **TECLADO · J2** y **MANDO**. Cada acción tiene dos casillas, principal y alternativa.
- Para cambiar una, se elige la casilla (clic, toque, o moviéndose con las flechas o la cruceta y aceptando) y se pulsa la tecla o el botón nuevo. Si esa tecla ya hacía otra cosa, aunque fuera del otro jugador, **se intercambian**: la otra acción se queda con la tecla vieja. Así una tecla nunca hace dos cosas.
- **Supr** (o △ / Y en el mando) deja una casilla vacía; **Esc** (o ○ / B mientras se espera una tecla, o la cruceta mientras se espera un botón) cancela. Esc, Supr, F1–F12 y las teclas del sistema no se pueden asignar, y la cruceta del mando siempre mueve.
- Además de 1, 2, 3 y 4 se pueden asignar atajos de **1+2**, **3+4** y los agarres **1+3** y **2+4** a una sola tecla o botón.
- Una acción del luchador sin ninguna tecla sale marcada en rojo.
- **RESTAURAR TECLADO** devuelve las teclas de fábrica de los dos jugadores a la vez (pueden haberse intercambiado entre ellos); **RESTAURAR MANDO**, los botones.
- Cada cambio se guarda en el momento en el dispositivo. Las teclas salen con el nombre que tienen en tu teclado (la Ñ es la Ñ) y los botones con los del mando conectado: PlayStation (✕ ○ □ △), Xbox (A B X Y) o Nintendo.
- Los atajos de Entrenamiento (R, P y T) solo funcionan mientras no se hayan asignado a una acción.

### Controles táctiles

En móvil y tablet aparecen controles en pantalla durante el combate, con la disposición de los juegos de lucha para móvil:

- **Joystick a la izquierda:** aparece donde apoyas el pulgar, en cualquier punto de la mitad izquierda. Tiene 8 direcciones con zona muerta, y las diagonales se mantienen estables (agacharse bloqueando, abajo-adelante + 2). Los dashes y las esquivas se hacen con toques rápidos, igual que con la cruceta.
- **Botones 1 2 / 3 4 a la derecha:** en la disposición de la recreativa (puños arriba, patadas abajo), girados para seguir el arco del pulgar. El hueco entre dos botones pulsa los dos a la vez (1+2, 3+4, 1+3 y 2+4). Se puede deslizar el pulgar de un botón a otro.
- **RAGE ART:** botón que solo aparece cuando tienes furia (equivale a 1+2+3+4).
- **II:** pausa y lista de movimientos, bajo el reloj.
- Cada pulsación se ilumina y, en Android, vibra un poco.
- En **Opciones → Controles táctiles** se puede elegir cuándo mostrarlos (automático, siempre o nunca), el tamaño, la opacidad, el tipo de joystick (flotante o fijo) y la vibración.

### Opciones de sonido y accesibilidad

En **Opciones**: volumen de música, efectos y voces por separado, y en **ACCESIBILIDAD**:
- **Subtítulos:** las frases de presentación y de victoria con o sin texto.
- **Temblor de cámara:** normal, suave o sin temblor (los golpes fuertes sacuden y empujan la cámara; para quien se marea).
- **Destellos:** normales o suaves (el fogonazo de los golpes y el desenfoque radial de los Rage Art y los K.O.).
- Si conectas un mando, los controles táctiles se ocultan solos.

### Reglas básicas

- **Bloqueo:** mantén *atrás* para bloquear golpes altos y medios; *abajo-atrás* bloquea los bajos.
- **Esquiva lateral:** toca *arriba* o *abajo*. **Dash:** pulsa *adelante* dos veces.
- **Agarre:** 1+3 (o 2+4, que es distinto según el luchador). Para zafarte, pulsa 1 o 2 en el momento del agarre.
- **Lanzador:** abajo-adelante + 2. Si conecta, su recuperación se puede cancelar con el siguiente golpe: espera a que el rival caiga un poco y remata en el aire (por ejemplo 1, 2 y un barrido). El daño de los golpes en el aire se escala.
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
| Noemí | La Coordinadora | Al mando de la sala de emergencias, con bata blanca y casco con micrófono: palmas abiertas, empujones y un desfibrilador | b+1 triaje (palmada al pecho que lo aparta) · f+4 empujón · 1+2 **desfibrilador** (se frota las palmas y descarga las dos en el pecho, con chispazo eléctrico: lanza; también remata su Rage Art) |

La lista completa de movimientos está en el menú de pausa. Al ganar, cada luchador suelta una de sus frases («Más sabe el zorro por viejo que por zorro», «¡Nadie para al Toro!»…).

### Frases de victoria

Al ganar un combate, cada luchador dice su frase con su propia voz (con subtítulo) mientras hace su gesto; la boca se mueve con lo que dice, y un botón no salta la pantalla de victoria hasta que ha terminado de hablar.

| Luchador | Frase | Gesto |
|---|---|---|
| Alejandro | «¿Eso era todo? Ni me he despeinado.» | Se alisa el pelo hacia el moño, se encoge de hombros con las palmas arriba y señala al perdedor |
| Arnau | «¡En mi consola esto era más difícil!» | Machaca los botones de un mando invisible y levanta el puño como quien vence al jefe final |
| Camilo | «No molestes, estoy trabajando.» | Saca el móvil, aparta al perdedor con el dorso de la mano sin levantar la vista y sigue tecleando |
| Rafa | «¿Ya? Iba a empezar a calentar.» | Se encoge de hombros, niega con la cabeza y estira los hombros como si no hubiera calentado |
| Zapponi | «¡Espectacular, vale!» | Los dos pulgares arriba hacia el perdedor, marcando cada palabra |
| Dani | «Más sabe el zorro por viejo que por zorro.» | Se toca la sien con el dedo y acaba con los brazos en V, como al cruzar una meta |
| Noemí | «Te falta tomar áloe vera.» | Mano en la cadera, le riñe con el dedo y se lleva la mano al auricular: caso cerrado |

### Frases de presentación

Antes del primer asalto, la cámara enfoca a cada luchador mientras sale su nombre y dice una frase con su voz (con subtítulo y la boca moviéndose). Cada plano dura lo que tarda en decirla, y cualquier botón salta la presentación. Al empezar cada asalto («RONDA 1», «¡A LUCHAR!»), la cámara entra girando desde un plano más abierto, una vez por cada lado, y se queda en el encuadre del combate justo cuando empieza.

| Luchador | Frase |
|---|---|
| Alejandro | «Calienta bien, que esto va a ser rápido.» |
| Arnau | «Partida nueva. Esta la gano yo.» |
| Camilo | «Tengo una reunión. Acabemos rápido.» |
| Rafa | «Tranquilo, que iré despacito.» |
| Zapponi | «¡Esto va a ser espectacular, vale!» |
| Dani | «Ponte los guantes, chaval.» |
| Noemí | «Voy cargadita de áloe vera, cuidado conmigo.» |

Las frases se cambian en `tools/quotes_tts.py` (texto, voz y tono; `INTROS` las de presentación, que se generan con `--intro`) y en `js/fight/styles.js`: `say` y `introSay` son los subtítulos, y `sayLen` e `introLen` lo que dura cada una en fotogramas, que la herramienta imprime al generarlas.

## Tecnología

- **Render:** PBR de Three.js con cadena HDR: MSAA, GTAO, bloom, profundidad de campo en las cinemáticas y un pase final con tonemapping AgX, grading CDL por escenario, viñeta y grano.
  - **Profundidad de campo** (presentación, K.O. y victoria, en calidad alta y ultra; `CineDOF` en `js/engine/post.js`): el fondo se desenfoca como con un teleobjetivo y el enfoque sigue al personaje. El pase de profundidad respeta el recorte de las tarjetas de pelo (antes el pelo era un bloque sólido y dejaba un halo nítido de fondo alrededor de la cabeza) y deja fuera chispas y polvo. Las puntas suaves del pelo (la pasada semitransparente) cuentan como parte de la cabeza a partir de un 15 % de opacidad: antes se desenfocaban como si fueran fondo, y en los primeros planos quedaba un borrón oscuro alrededor del pelo y el borde recortado y pixelado. La profundidad también sigue el balanceo del pelo. (`?dofa=` cambia ese umbral.) El desenfoque recoge muestras en espiral y cada una cuenta solo hasta donde llega su propio desenfoque, así que un luchador enfocado no mancha de color el fondo borroso que tiene detrás.
  - Sombras solares en dos cascadas: una fina que sigue a los luchadores y otra amplia para el escenario (`js/engine/sunshadow.js`).
  - Una luz principal, un contraluz y una luz de relleno que solo afectan a los personajes (`FIGHTER_KEY`). El relleno es suave, frontal y sin brillo propio: abre las cuencas de los ojos y el lado en sombra de la cara, con más fuerza en los primeros planos de la presentación y la victoria; la piel lo recibe entero, el pelo un 70 % y la ropa solo un 30 %, para que una prenda blanca no se queme.
  - Oclusión ambiental contenida (radio de 25 cm, intensidad 0,75): con 35 cm y 0,85, en los primeros planos las manos ensuciaban la cara que tenían delante y las cuencas de los ojos se iban a negro. Un objeto solo hace sombra de contacto a lo que tiene a menos de 40 cm detrás, y el efecto se desvanece entre 20 y 40 cm en vez de cortarse de golpe. Con 1,2 m, un luchador oscurecía la pared que tenía a un metro, como si estuviera pegado a ella, y quedaba un aura oscura alrededor de la figura, muy visible alrededor de la bata blanca de Noemí en el porche. El suavizado de la oclusión ya no la arrastra de la figura al decorado. El bloom arranca a partir de 1,7 en HDR: una bata blanca a pleno sol ya no brilla con halo, y las farolas, las pantallas y las chispas sí lo tienen. (`?aor=`, `?aoi=`, `?aot=` —el grosor—, `?aodp=`, `?noao=1` y `?bloomth=` cambian estos valores para comparar capturas.)
  - Sombras de contacto bajo los pies y reflejos planos en la piscina.
- **Personajes:** malla base de MakeHuman (CC0), ajustada a las fotos.
  - Landmarks faciales con MediaPipe y ajuste de cámara en perspectiva, más campos RBF para la cara.
  - Textura facial proyectada desde la foto, con eliminación de gafas, corrección de color y costura del cuello igualada.
  - Pelo con *hair cards* en dos pasadas (con canas mezcladas en el caso de Rafa) y barba con *fur shells*. El pelo se balancea con la inercia de la cabeza (`js/anim/hairsway.js`): un muelle amortiguado, movido por la aceleración del centro del pelo (giros incluidos) y por la gravedad cuando la cabeza se inclina, retrasa las puntas, y el sombreador desplaza cada vértice de la tarjeta según su posición en el mechón (la raíz no se mueve). Cuánto se mueve depende del peinado (`hairSway` en `styles.js`: la media melena de Noemí más que el pelo corto de Rafa); va con el reloj del combate, así que la cámara lenta también ralentiza el pelo, y en las pausas de impacto se queda quieto. Su sombra y la profundidad del desenfoque cinematográfico se mueven con él. Solo se dibuja: la simulación y el online no lo ven.
  - Manos con el tono de la piel del antebrazo: la piel base de MakeHuman pintaba el dorso más oscuro y rojizo, con una mancha roja en cada nudillo y una franja roja en la muñeca, y de cerca las manos parecían sucias o magulladas (`tools/pipeline/handskin.py`: el tono general va un 65 % hacia el del antebrazo, el detalle fino conserva la mitad de su contraste y la limpieza sube por la muñeca).
  - El casco de Noemí se apoya sobre el pelo: el auricular y la almohadilla del otro lado quedan donde termina su melena (de 3 a 5 cm más allá de la oreja) y no sobre el cuero cabelludo, y la diadema hace un arco que sigue el contorno del pelo por arriba y por los lados. Antes el auricular quedaba enterrado entre los mechones y solo asomaba cuando el pelo se balanceaba, y la almohadilla era una caja plana; ahora es una pieza redondeada que se inclina con la curva de la cabeza.
  - **Manos que giran sobre sus articulaciones** (`js/anim/corskin.js`): el *skinning* lineal mezcla las matrices de los huesos y, al cerrar el puño, la base del pulgar gira 109°: la piel entre la muñeca y el pulgar se hundía hacia el eje y se doblaba sobre sí misma (una franja gris en los primeros planos) y los nudillos se aplanaban. Ahora cada punto de la mano gira alrededor de la articulación entre los huesos que lo mueven (*skinning* con centro de rotación: rotaciones mezcladas como cuaterniones y la escala aparte, porque las manos se dibujan 1,2 veces más grandes que el antebrazo). Se aplica parcheando los sombreadores de *skinning* de Three.js para todos los pases a la vez (color, sombra, oclusión y desenfoque), y cada malla lo activa con su atributo `skinCor`. La piel de las manos es además algo más mate que la de la cara (más rugosa y con menos capa de grasa): en el puño cerrado la base del pulgar ya no refleja el entorno como una mancha gris. `?cor=0` en cualquier página vuelve al *skinning* lineal para comparar.
  - **Zapatillas New Balance** para Alejandro, Rafa y Zapponi, con su «N» en los dos costados de cada pie (`tools/pipeline/nbshoes.py`): las texturas de zapatilla de MakeHuman eran fotos de unas Adidas y unas Nike. Cada píxel se pinta desde su punto en la zapatilla (altura, avance hacia la puntera, lado), así que los paneles siguen sin cortes por las costuras de la textura: empeine, refuerzos de ante o piel, entresuela, suela con dibujo, cordones con relieve que se cruzan por encima y por debajo y el calcetín de canalé. Las dos zapatillas compartían la misma textura en espejo y una letra salía al revés en un pie: ahora cada pie tiene su mitad de una textura el doble de ancha. Alejandro lleva unas de piel blanca con la N azul marino y el talón negro (como en su foto), Rafa unas de correr verde lima con la N perfilada y calcetín negro (como en la suya) y Zapponi unas 574 grises de ante y malla con la N blanca. Llevan mapa de relieve (costuras, perforado, la N, la malla, el dibujo de la suela) y de rugosidad (piel, ante, malla, goma).
  - **Costuras sin líneas** (`tools/pipeline/uvpad.py`): una textura se lee de sus versiones reducidas en cuanto la superficie se aleja o se ve de lado, y entonces cada costura mezclaba lo que hay fuera de la isla de la textura: en la piel era un fondo beis a pocos píxeles del borde (una línea clara en cada costura de manos y brazos de cerca) y su mapa de relieve, calculado desde ese color, marcaba un reborde alrededor de cada isla. Ahora todo el fondo se rellena con los colores de las propias islas, extendidos suavemente (*push-pull*), en todas las texturas de los luchadores, y el relieve pierde el reborde sin perder el detalle de la piel. De paso, las texturas pesan mucho menos: el fondo con ruido era la mayor parte de la de la piel.
  - Ropa como capas skinned con pliegues y relajación del tejido. Accesorios procedurales: gafas, relojes, pulseras y la medalla de finisher.
  - **Ropa que se mueve** (`js/anim/clothsway.js`): el bajo de la bata de Noemí, de la chaqueta de Arnau y de las camisas se retrasa con la inercia de la cadera (un muelle amortiguado movido por su aceleración, giros incluidos) y en las vueltas se abre en redondo con la velocidad de giro. Cada vértice se mueve según lo libre que esté: nada en la cintura, del todo en el bajo, nada en las mangas; y solo hacia fuera o a lo largo de la tela, nunca hacia dentro del cuerpo: el lado que va detrás se abre y el que empujan las piernas no las atraviesa. Cuánto se mueve va por luchador (`clothSway` en `styles.js`: la bata ligera del todo, la chaqueta de chándal, con su cintura elástica, menos). Su sombra y el desenfoque cinematográfico se mueven con ella. Solo se dibuja: la simulación y el online no lo ven.
- **Animación:** rig IK propio y claves procedurales para cada golpe, con muelles de inercia en torso y cabeza, parpadeo y cierre de ojos en los golpes y KO.
  - **Expresiones faciales** (`setFace` en `js/anim/rig.js`, solo se dibujan): al recibir un golpe la cara hace una mueca (cejas fruncidas y hacia abajo, aletas de la nariz y labio superior arriba, dientes a la vista); durante la preparación y el impacto de un golpe propio, el gesto se endurece (cejas bajas, boca apretada); al ganar sonríe, y en el K.O. la cara se queda relajada. Usa los huesos faciales del esqueleto (cejas, comisuras, labios), que hasta ahora solo movían párpados y mandíbula, y pasa de un gesto a otro de forma suave.
  - **Presentación:** la toma de cada luchador dura hasta que termina su frase, más que su animación de entrada; al acabarla vuelve a la guardia con los puños a la altura del pecho y no delante de la cara, para que se le vea mientras habla (la guardia completa llega al empezar el asalto).
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
  - **Revisión de movimientos (v0.70)**, medida con `tools/animaudit.mjs` y comprobada en renders fotograma a fotograma (posturas imposibles de cadera, rodilla y cuello: de 2153 fotogramas a 550; brazos y piernas metidos en el propio cuerpo y saltos bruscos, también menos). Los alcances y los frames de los golpes no cambian (solo el barrido de Dani llega 5 cm más lejos):
    - **Rig:** un brazo casi estirado que rozaba el cuerpo podía girar 180° sobre sí mismo de un fotograma a otro (la mano apoyada del barrido daba la vuelta); ahora el codo se aparta como mucho 100° y cada vez menos según el brazo se estira. La cabeza ya no da latigazos en los giros: el seguimiento con la mirada tenía el desvanecido al revés, nunca miraba al rival de frente y lanzaba la cabeza al tope del cuello cuando el rival pasaba por la espalda; se ha quitado, porque todas las poses llevan la cabeza ya orientada. El cuello llega a su tope con suavidad. Al caer tras un agarre los codos vuelven a su sitio (antes los dos brazos rotaban en un fotograma), la mano que pasa junto a la cara se suelta poco a poco y las manos que rodean una cintura en el abrazo del oso y el suplex ya no acaban una dentro de la otra.
    - **Barrido:** mantiene la guardia en vez de dejar la mano colgando como una garra junto al tobillo (no llega al suelo desde esa postura), la cadera gira sobre el pie de apoyo y el pie que barre roza el suelo sin engancharse y aterriza suave.
    - **Patada giratoria de Alejandro:** la rodilla sube por su lado y la patada sale recta desde su cadera (antes los muslos se cruzaban 14 cm), con el tronco más inclinado como contrapeso.
    - **Patada alta:** la cadera se inclina más y el tronco se endereza contra ella (la pierna se abría 20° más de lo que da una cadera).
    - **Patadas en salto** (todas y la voladora de Camilo): la cadera baja en arco desde lo alto del salto y las rodillas amortiguan la caída; antes colgaba en el aire y caía medio metro en dos fotogramas, y los pies tocaban el suelo de puntillas.
    - **Lanzado al aire:** el brazo que queda atrás sale primero hacia fuera en vez de atravesar el pecho. En la patada en carrera de Camilo, el brazo ya no atraviesa la barriga.
    - **Victoria de Alejandro y presentación de Rafa:** la mano que se peina pasa por el lado de la cabeza y el puño de Rafa choca contra la palma en vez de meterse dentro.
    - **Noemí:** guardia más baja y abierta (se le ve la cara) y puñetazos con el puño cerrado y la muñeca alineada, que pegan con los nudillos y no con el dorso de la mano; tras cada golpe vuelve a su propia guardia.
  - **Patadas (v0.73)**, comprobadas en tiras de `fightlab` y medidas fotograma a fotograma (ángulo de la rodilla al estirarse, altura del pie, inclinación del tronco). Los alcances son los mismos de antes con 2-4 cm de diferencia (Noemí, 6 cm más en la patada alta), comprobados cada 2 cm:
    - **Patada frontal (todos), patada en carrera de Camilo y empujón de Noemí:** la pierna se estira de verdad. Antes el pie se quedaba a un tercio de metro de una pierna estirada: la rodilla subía y la espinilla colgaba en zigzag (108-128° en la rodilla), más un rodillazo que una patada. Ahora la rodilla sube con el pie recogido, la pierna sale casi recta a la altura del estómago (165-170°) con la cadera empujando y el tronco algo echado atrás, y la espinilla se recoge bajo la rodilla antes de bajar el pie. El cuerpo ya no da un paso adelante detrás de la patada, y por eso el alcance no cambia.
    - **Patada en salto (uf+4 / u+4):** no salía nunca, porque el arriba que va con el botón empezaba el salto en el mismo fotograma y el botón se perdía. Ahora un salto que acaba de empezar admite los golpes de salto. La patada sale recta a la altura del pecho (antes en zigzag) con la otra pierna recogida (antes colgaba estirada) y la cadera inclinada atrás, sin forzar la articulación.
    - **Patada alta:** la pierna llega casi estirada a la cabeza (165°; antes 140°) y la cadera se inclina un poco más, así que se fuerza menos de lo que da la cadera.
    - **Patada baja:** la rodilla ya no queda bloqueada del todo y hay muchos menos saltos bruscos.
    - **Plancha de Arnau:** antes se quedaba sentado en una silla invisible, con la cadera a 36 cm del suelo y la pierna delantera doblada. Ahora la cadera casi toca el suelo, la pierna delantera se estira por el suelo con el pie flexionado y la otra se dobla debajo.
    - **Brazos y cabeza en las patadas** (revisados en tiras desde tres cuartos, donde se ven los brazos, y medidos: codo, posición de la mano respecto al hombro e inclinación de la cabeza):
      - Patada frontal, patada en salto y patada en carrera: la guardia se queda en la cara. Antes las manos bajaban al pecho y se abrían con los codos fuera, o en la patada en salto se quedaban arriba y abiertas, como celebrando.
      - Patada alta, patada en carrera y patada voladora: el brazo del lado que patea baja a lo largo del costado y va hacia atrás como contrapeso. Antes se iba a la cadera y se quedaba doblado detrás, como un ala.
      - Barrido: la mano de atrás queda en una guardia baja delante del pecho, en vez de en alto y abierta.
      - Rodillazo de Alejandro: las manos van al cuello del rival, como en un clinch, en vez de por encima de la cabeza.
      - Plancha de Arnau: la mano de atrás se apoya en el suelo detrás de la cadera y la otra guarda la cara. Antes iba con los brazos en cruz.
      - La mirada se queda en el rival cuando el tronco se echa atrás. En la patada alta miraba al cielo y en la plancha hacia arriba.
  - **Golpes de lado (v0.74):** la patada alta, el revés de Camilo y el bofetón de Dani ya no echan la cabeza del rival hacia atrás mirando al cielo, como si fuera un directo. Ahora la cabeza sale girada hacia el lado contrario al golpe (unos 60°) y se inclina hacia ese hombro sin levantar la barbilla; el tronco se ladea y retrocede sin girarse, los puños caen de la cara y el peso se va a la pierna de atrás; luego la cabeza vuelve la primera, buscando al rival, y se cierra la guardia (reacción `hitHighSide` en `js/fight/moves.js`, medida fotograma a fotograma: giro e inclinación de cabeza, pecho y cadera). El empujón del golpe y las chispas salen en la dirección en que venía el golpe, no siempre de frente (`swing` en el golpe; también en el lariat de Zapponi y el barrido). El golpe lateral solo empuja la cabeza: si giraba también el tronco, el brazo de delante se metía en la pierna que aún está en la cabeza.
  - **Caída girando (v0.74):** cuando la patada alta o el bofetón de Dani tumban en contraataque, el rival ya no cae de espaldas como un bloque: da una vuelta completa sobre sí mismo hacia el lado del golpe, rápida al principio y frenando, con los brazos abiertos por el giro y las piernas rectas en la línea del cuerpo, y cae de espaldas mirando como antes (`spin` en el golpe, clip `spinOut`; el giro lo hace `Fighter` en el estado `air` y va en la instantánea del online).
  - **Patada baja (v0.74):** la pierna golpeada sale barrida hacia atrás y fuera del suelo, con la rodilla cediendo, la cadera de ese lado cae, el brazo de ese lado se abre para equilibrarse y la cabeza mira la pierna; luego apoya el pie con cuidado y vuelve a la guardia. Cede la pierna en la que pega el golpe, la más cercana al punto de impacto (`legStruck` en `js/fight/match.js`): casi siempre la adelantada, la espinilla, a unos 20 cm del suelo; la de atrás si el rival está girado o a la pata coja. El jab agachado, que pega en el estómago, conserva su reacción de siempre (`hitPoke`).
  - **Gancho al hígado de Dani (v0.74):** reacción propia (`hitLiver`). El rival se dobla hacia el lado del hígado (ladeado, sin girarse: girado, el costado se escapaba del puño de Dani y le daba un tirón en la muñeca), el codo derecho baja a taparlo y la mano cubre el costado cuando el puño ya se ha ido; la rodilla derecha cede, vuelve a hundirse a mitad, como cuando el dolor llega tarde, y se endereza despacio.
  - **Puños y manos al golpear** (medido en el fotograma de impacto de cada golpe de los siete luchadores con `tools/palmaudit.mjs` y comprobado en tiras de `fightlab`):
    - Todos los puñetazos rectos (jab, directo, 1-2, puñetazo con avance, jab agachado, golpe al cuerpo, la ráfaga de Alejandro y el Rage Art) impactaban con la palma hacia arriba: el giro del antebrazo iba al revés. Ahora el puño gira en el recorrido, como el de un boxeador: sale de canto desde la guardia y llega con los nudillos horizontales, la palma abajo y algo ladeado (unos 15°); el golpe al cuerpo llega más ladeado (unos 40°). La muñeca queda recta en la línea del antebrazo, y el giro empieza ya en la preparación para no concentrarse en el último tramo.
    - **Guardia:** puños de canto, con las palmas enfrentadas y un poco hacia la cara, y el pulgar hacia uno mismo (antes las palmas miraban a la propia cara, como sujetando una taza).
    - **Uppercut** (y el puñetazo gacela de Dani): la palma mira a quien golpea, con el antebrazo supinado, como se lanza un uppercut.
    - **Golpes especiales:** el *smash* de Rafa termina con la palma abajo (llegaba con la palma arriba); el martillo de Arnau y el hacha a dos manos de Zapponi bajan con el canto del puño, palmas enfrentadas; el revés de Camilo golpea de canto con el dorso de los nudillos por delante; el bofetón de Dani llega con la palma por delante en la dirección del barrido.
    - **Palmadas de Noemí** (triaje y desfibrilador): la mano gira con la palma abajo y se dobla hacia atrás por la muñeca, con los dedos arriba, para golpear con el talón de la mano; antes llegaba con la muñeca recta, como pegando con la punta de los dedos.
    - **Pulgar:** en el puño cerrado se recoge sobre el índice y el corazón, en vez de asomar por debajo (`THUMB_*` en `js/anim/rig.js`; `fightlab.html?thumb=oposición,base,falange2,falange3` prueba otros valores).
    - **Punto de impacto de la mano:** está a la distancia de los nudillos, en la línea del antebrazo, gire como gire la mano o se doble la muñeca (`limbWorld` en `js/fight/fighter.js`). Antes giraba con la mano: al pasar de palma arriba a nudillos arriba se movía unos centímetros de lado y hacia atrás, y las combinaciones del entrenamiento que entran por poco (1 1 2, la rodilla seguida de 1…) dejaban de enlazar. Frente a la versión anterior, medidos de 2 en 2 cm, los alcances cambian entre −2 y +2 cm en casi todos los golpes; los jabs agachados llegan 6 cm más lejos y algunos golpes rectos entre 4 y 8 cm (el jab de Camilo, el directo y el golpe al cuerpo de Zapponi, la ráfaga de Alejandro).
  - **Agarres coreografiados** (`js/fight/throws.js`): cada agarre define la trayectoria de la víctima respecto a quien agarra, dónde se sujeta cada mano (hueso del rival + desfase) y los impactos. Rodillazos, abrazo del oso con levantamiento y suplex por encima de la cabeza; la distancia se ajusta al tamaño del torso de cada pareja.
  - Reacciones propias para cada caso: golpe alto (de frente o de lado), medio, al hígado y bajo (en la pierna que recibe); lanzamiento; caída girando; derribo; barrido (cae de espaldas como un bloque); aterrizaje y levantarse.
  - Máquina de estados de lucha a 60 Hz fijos, con hitstop, empuje, counters, juggles, agarres y knockdowns.
  - Ragdoll Verlet en los KO.
- **Público de La Meta 10K:** los propios luchadores, re-vestidos y posados, pre-renderizados en un atlas de 64 sprites (`crowdlab.html`) y dibujados con una sola llamada instanciada.
- **Audio:** golpes, pasos, caídas y ambiente grabados; música, público y voces grabados.
  - **Golpes grabados** (`assets/sfx/fight.mp3`, 233 KB, con su tabla `fight.json`; los prepara `tools/sfx_build.py`): puñetazos ligeros y fuertes, golpes sordos al cuerpo, bofetadas, bloqueos con un golpe seco de madera, pasos en cemento o en la tarima del festival y silbidos de los golpes al aire. Cada impacto elige una de las cinco tomas al azar (nunca la misma dos veces seguidas), con un poco de variación de tono y volumen, y se mezcla en capas: una patada lleva el puñetazo más grave y un golpe al cuerpo; un golpe fuerte, además, un grave sintetizado para que pese. Un contraataque suena con un chasquido seco, y el golpe que deja K.O., con un retumbe largo. El silbido suena justo antes de que el golpe pueda llegar, no al empezar el movimiento. Mientras el archivo no ha cargado, suenan los golpes sintetizados de antes. Grabaciones CC0 de [Kenney](https://kenney.nl/assets/impact-sounds) y [artisticdude](https://opengameart.org/content/swishes-sound-pack).
  - **Ambiente de cada escenario** (`tools/ambience_build.py`, bucles sin cortes bajo la música): una calle con tráfico en El Porche (IgnasD) y una tarde al aire libre en la azotea (Kresiek The Furry), ambas CC0. Cuando un luchador habla, la música baja un poco para que se le entienda.
  - **Cámara lenta** (K.O., Rage Art): la música y el ambiente se apagan bajo un filtro, como si el mundo se detuviera, mientras los golpes, las voces y la ovación del público siguen nítidos; vuelven al recuperar la velocidad.
  - **Música** en `assets/music/` (se reproduce en streaming, una pista a la vez; la lista completa está en `assets/music/CREDITS.txt`), de [Kevin MacLeod](https://incompetech.com) con licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), elegida por estilo para que cada escenario tenga su identidad:
    - **El Porche**, funk y hip hop urbano: «MTA», «Rocket Power» y «Wepa»; en la ronda decisiva, «Urban Gauntlet».
    - **La azotea**, disco latino y salsa: «Electro Cabello», «Arroz Con Pollo» y «Disco con Tutti»; en la ronda decisiva, «El Magicia».
    - **La meta 10K**, rock: «Hotrock», «Exhilarate» y «Exit the Premises»; en la ronda decisiva, «Summon the Rawk».
    - **El Festival**, discoteca: «Pamgaea», «District Four», «Who Likes to Party» y «Club Diver»; en la ronda decisiva, «Cut and Run».
    - Menús: «Latin Industries»; entrenamiento: «Funkorama» (más tranquila); final del arcade: «Super Power Cool Dude».
    - Cada combate empieza con la siguiente canción del escenario (la primera, al azar) y la música sigue entre asaltos; cuando una termina entra la siguiente, y en la ronda decisiva entra la del final. `tools/music_build.py` las prepara desde los originales: recorta las introducciones largas y silenciosas (una pista puede empezar en mitad de un asalto) y los finales que se apagan, quita los graves por debajo de 32 Hz, iguala el volumen a −16 LUFS (todas a ±0,3 dB) y mide el tempo y el primer pulso de cada una (las luces y el público del festival van a compás).
  - **Acústica de cada escenario:** los golpes, caídas y pasos resuenan en el espacio de cada sitio: una cola de reverberación con su duración y su brillo y los primeros rebotes de lo que hay alrededor (los soportales y fachadas de El Porche responden pronto y muchas veces, la azotea abierta apenas, los edificios altos de la avenida devuelven un eco tardío, la concha del festival da una cola cálida y más larga).
  - **Golpes que se sienten:** con los golpes fuertes, los contraataques y sobre todo el K.O., la música se aparta un instante, como haría una mesa de mezclas, y el público de la calle y del festival reacciona (un murmullo que sube y, en un contraataque, una ovación corta).
  - **Menús** con sonidos grabados (Kenney Interface Sounds, CC0): mover el cursor, confirmar (con un golpe sordo debajo, para que la elección tenga peso) y volver atrás, en lugar de los pitidos sintetizados.
  - **Público de la calle** en `assets/sfx/`: un bucle de ambiente sin cortes y una ovación en cada K.O., de las [grabaciones de Gregor Quendel](https://opengameart.org/content/free-crowd-cheering-sounds) (CC BY 4.0). En El Festival suena el mismo público, más lejos.
  - Los créditos también aparecen en el menú de opciones.
  - **Locutor en español** con voz natural: frases pregrabadas en `assets/voice/` («Ronda uno», «¡A luchar!», «¡K.O.!», «¡Gana Rafa!»…), unos 230 KB en total.
  - Generadas con el sintetizador neuronal [Piper](https://github.com/rhasspy/piper) (voz `es_ES-davefx-medium`), con un ligero eco de pabellón.
  - La voz de davefx se entrenó con datos de dominio público (CC0), pero parte del modelo base *lessac*, con licencia de investigación: úsalas solo en un proyecto no comercial.
  - Si falta un clip, se usa la voz del propio dispositivo.
  - **Frases de victoria** en `assets/voice/quote_*.mp3`, también con Piper (`tools/quotes_tts.py`): voces `es_ES-davefx-medium` y `es_ES-sharvard-medium` (corpus [Sharvard](https://datashare.ed.ac.uk/handle/10283/574), CC BY 3.0, voces masculina y femenina), con un tono distinto para cada luchador. Igual que la del locutor, parten del modelo base *lessac*: solo para un proyecto no comercial.
  - **Gritos de los luchadores** grabados por actores, en `assets/voice/fx/` (unos 820 KB). Cada luchador tiene su propia combinación de voz y tono, con variantes de ataque, dolor, golpe fuerte y K.O. que no se repiten dos veces seguidas.
    - Voces de [HaelDB](https://opengameart.org/content/male-gruntyelling-sounds) (CC0) y de VoiceBosch ([esfuerzos](https://opengameart.org/content/effort-sounds-male-audio-pack) y [daño](https://opengameart.org/content/damage-sounds-male-audio-pack), CC-BY-SA 4.0).
    - La voz de Noemí: [Female Gruntwork 1](https://opengameart.org/content/female-gruntwork-1) de PlumpDev (CC-BY-SA 4.0) y [Female Warrior Grunts](https://opengameart.org/content/female-warrior-grunts) de SkyRae (CC-BY 3.0), separados en gritos sueltos.
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

- `tools/pipeline/`: pipeline de construcción de personajes en Python. El punto de entrada es `buildchar.py`; los parámetros de cada luchador están en `people.py` y la ropa en `outfits.py`. `hairgen.py` genera el pelo con tarjetas (la melena rizada de Noemí es `grow_bob`) y `garments.py` la ropa (bata con escote en V recto y caída desde el pecho). `noemi_photo.py` prepara su foto: borra el micrófono del casco que le cruza la mandíbula. Las texturas de mechones `hair_cards_s.png` y `hair_cards_curly_s.png` (las de Alejandro, Arnau, Camilo, Rafa y Dani, y las que toma un luchador nuevo) tienen la raíz densa en la raíz de cada tarjeta y la hacen aparecer poco a poco en el primer 7 % del mechón: el pelo se ve lleno y su nacimiento no dibuja una línea dura de peluca. Las `_r` tienen la raíz densa sin ese difuminado; la melena de Noemí usa `hair_cards_curly_r.png`, que en su raya queda mejor. Las primeras, `hair_cards.png` y `hair_cards_curly.png`, estaban invertidas: dejaban transparente el primer cuarto de cada mechón (pelo ralo, con el cuero cabelludo pintado a la vista); se quedan solo como referencia. **Cuellos:** el escote de las camisetas (y de la chaqueta de Arnau) va al pie del cuello (`CREW` y `ZIP_NECK` en `outfits.py`; los primeros cortes dejaban un escote ancho y bajo que enseñaba las clavículas) y la tela del cuello se pega a la piel: baja a un tercio de su separación en el borde y la recupera en 7 cm (`neck_snug` de `make_shell`), y cerca del cuello usa los pesos de hueso de la piel que tiene debajo, para que al levantar un brazo no asome la piel. El cuello del polo de Alejandro es como el de un polo real: 2,5 cm de pie, una caída de 3,5 a 4,5 cm con las puntas cortas y un canalé fino. `garmentswap.py <luchador aprobado> <reconstrucción> <salida> shirt [collar buttons]` pone en un luchador solo las prendas reconstruidas (y qué caras del cuerpo tapan): la cara, el pelo, la barba y todo lo demás se quedan como estaban aprobados. `meshfmt.py` lee y escribe las mallas en sus dos formatos (el cuantizado es el que se publica, y cada dato se guarda como venga mejor comprimido: tal cual, en diferencias con la fila anterior y/o con los bytes agrupados; dos piezas con los mismos datos los comparten; `python3 meshfmt.py <carpeta>` convierte una del formato antiguo y dice el error máximo de cada dato). `nbshoes.py <carpeta> court_white|freshfoam_lime|574_grey [--preview salida.png]` pinta las zapatillas New Balance (lo llama `buildchar.py` con `shoes_nb=` de `people.py`). `uvpad.py <carpetas>` rellena el fondo de las texturas de un luchador con los colores de sus islas y quita el reborde del relieve de la piel y la cabeza (`bodytex.py` y `buildchar.py` ya lo hacen al construir). `keeppart.py <carpeta vieja> <carpeta nueva> hair` devuelve a una reconstrucción el pelo de la versión aprobada: al volver a generar un luchador la cabeza se mueve fracciones de milímetro y los mechones aleatorios salen distintos, aunque el peinado sea el mismo. La barba de Dani lleva en el canal verde de `beard_d.png` la proporción de canas de cada zona (más blanca en la barbilla).
- `tools/festival_prep.py`: limpia la foto del escenario del festival y saca sus texturas (`assets/stage/fest_*`).
- `tools/sfx_build.py <carpeta de Kenney> <carpeta de swishes>`: prepara los golpes grabados (`assets/sfx/fight.mp3` y `fight.json`): recorta cada toma, iguala el volumen de las tomas de cada grupo y las junta en un solo archivo con la tabla de dónde empieza cada una.
- `tools/ambience_build.py <escenario> <grabación>`: prepara el ambiente de un escenario (`assets/sfx/amb_<escenario>.mp3`): filtra, suaviza los momentos fuertes y hace un bucle sin cortes.
- `tools/music_build.py <carpeta con los originales>`: prepara la música (`assets/music/*.mp3`) desde los MP3 originales de incompetech y su catálogo `pieces.json`: recorta introducciones y finales largos, filtra los graves, iguala el volumen a −16 LUFS, codifica a 128 kbps y mide el tempo y el primer pulso de cada pista (imprime la tabla `BEATS` de `js/audio/audio.js`). La lista de pistas por escenario está en su tabla `TRACKS`.
- `tools/quotes_tts.py <carpeta de voces> [--intro] [luchadores]`: genera con Piper las frases de victoria o, con `--intro`, las de presentación, e imprime en qué fotograma acaba cada una.
- `tools/*.mjs`: capturas headless con Playwright (`shot.mjs`), pruebas de flujo de menús (`flow.mjs`, `flow2.mjs`), simulación de combates sin gráficos para equilibrar (`simtest.mjs` y `rr.sh`), banco de dificultad (`diffbench.mjs`: un jugador novato o medio simulado contra cada nivel de la CPU, muchos combates; da el porcentaje de combates y asaltos ganados) y horneado del público (`crowdbake.mjs`). Las herramientas localizan el juego a partir de su propia carpeta; la variable `GAME_ROOT` permite apuntar a otra copia.
- Móvil:
  - `tools/mshot.mjs`: capturas con perfiles de móvil y tablet (844×390 @3x, 667×375 @2x, vertical, 1180×820 @2x).
  - `tools/mtouch.mjs`: prueba los controles táctiles con toques multitáctiles reales (menús, joystick, botones, pulsaciones dobles, deslizamientos, pausa, opciones); son 20 comprobaciones.
  - `tools/arcadetest.mjs`: juega el modo arcade completo (los seis rivales, pantalla de carga «COMBATE X DE 6», resultados de cada combate, banner de campeón y vuelta al menú) y comprueba que cada combate carga exactamente dos luchadores.
  - `tools/resultstest.mjs`: un combate de arcade jugado entero por dos CPU. Comprueba la pantalla de resultados, la jugada del combate, que su repetición a cámara lenta es el combate fotograma a fotograma (vida y posición de los dos) y el paso al siguiente rival.
  - `tools/extrastest.mjs`: EXTRAS y desbloqueos. Arcade ganado, final del campeón (texto que se escribe solo, un toque lo muestra entero), logros con sus avisos, galería de finales, cabezones, el traje de campeón en la selección y los trajes distintos en un combate espejo.
  - `tools/loadprof.mjs [Mbps] [latencia]`: mide la primera carga con una red de móvil simulada (20 Mbps por defecto): cuándo se ve la pantalla de carga, cuándo se puede usar el título, cuántos MB se han bajado hasta entonces, las fases del arranque y los ficheros que más pesan.
  - `tools/preloads.py`: regenera en `index.html` la lista de módulos que el navegador pide de golpe al empezar.
  - `tools/necklinecheck.mjs [--fighters a,b]` (con `node --import ./register.mjs`): juega todos los movimientos de cada luchador y mide, fotograma a fotograma, si la piel de la base del cuello sale por el escote de la camiseta. Con los cuellos nuevos, la entrada de Alejandro con los brazos arriba pasa de 24 mm a nada, y solo el barrido y el suplex llegan a 5-10 mm un instante (con las camisetas antiguas eran 28-43 mm).
  - `tools/controlstest.mjs [salida]`: prueba los controles configurables en el juego real: cambiar teclas con clic y tecla, los intercambios (también entre jugadores), Esc, Supr, las teclas reservadas, un mando simulado que maneja la pantalla y cambia botones, RESTAURAR, que todo siga tras recargar, que los menús sigan las teclas nuevas, un combate con la tecla y el botón nuevos, la pausa y la ayuda de EXTRAS; y que un guardado estropeado no rompa nada.
  - `tools/wintest.mjs [salida] [--fighters a,b] [--shots]`: gana un combate con cada luchador y comprueba su frase de victoria: empieza en su fotograma, sale el subtítulo, la boca se abre con ella, un botón no la corta y el móvil de Camilo solo aparece en su gesto. `--shots` guarda una captura de cada uno a media frase.
  - `tools/trainingtest.mjs [salida] [--fighters a,b]`: juega todas las pruebas de combo de todos los luchadores con un jugador guionizado que prueba distintos tiempos, y falla si alguna no se puede hacer. Además, el bloqueo del sparring, el historial de entradas y la grabación y su repetición.
  - `tools/continuetest.mjs [salida]`: el «continuar» del arcade. Simula que el juego pasa a segundo plano a mitad de combate y se cierra. Comprueba que al volver aparece CONTINUAR, que el combate sigue exactamente igual (fotograma, vida, posiciones, reloj y rival), la cuenta atrás, el guardado solo cada pocos segundos, GUARDAR Y SALIR, el paso al siguiente rival y el borrado al ser campeón.
  - `tools/voicetest.mjs` y `tools/musictest.mjs`: cargan y reproducen todas las voces y gritos, las frases de victoria y de presentación (con la boca moviéndose), y la música del menú y de los escenarios (cambios de pista, pausa al ocultar la página, público de la calle; que dos combates seguidos en un escenario suenen con canciones distintas, que la ronda decisiva cambie a la suya, que al acabar una canción entre la siguiente, la acústica, los sonidos de menú y que las luces del festival vayan a compás; termina con MUSIC OK).
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
- Páginas de laboratorio: `viewer.html` (personajes), `poselab.html` y `animlab.html` (poses y golpes), `fightlab.html` (tiras de fotogramas de combates guionizados sobre suelo cuadriculado), `lineup.html` (proporciones con regla), `stagelab.html` (escenarios), `crowdlab.html` (público) y `postlab.html` (un luchador ante una pared de ventanas con la cadena de posprocesado del juego: oclusión ambiental, profundidad de campo y bloom. Sirve para revisar en segundos, sin arrancar un combate, el pelo contra el fondo desenfocado, los halos alrededor de la silueta, las manos o los accesorios; admite `id`, `dof=0`, `back`, `dist`, `rot`, `fov`, `ty`, `guard=1`, `sway=x,y,z` y los parámetros del posprocesado).
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
  - `rangeall.mjs`: alcance real de cada golpe de cada luchador; detecta golpes que nunca conectan. Mide cada 10 cm; con `STEP=0.02`, cada 2 cm (para comprobar que un cambio en una animación no cambia el alcance).
  - `palmaudit.mjs [luchadores|all] [golpes]`: hacia dónde mira la mano en el fotograma de impacto de cada golpe con la mano (giro de la palma respecto al antebrazo, flexión de la muñeca, palma de frente y dedos arriba); sirve para fijar el giro del antebrazo (`twist`) de un golpe nuevo: cada radián gira la palma unos 57°, y en positivo la lleva hacia abajo.
  - `proportions.mjs` y `armcheck.mjs`: proporciones corporales frente a normas antropométricas.
- `fightlab.html?scn=...`: además de los escenarios básicos, tiene `punches`, `kicks`, `high`, `sweep`, `lunge`, `spin`, `throw1`, `throw2`, `special`, `fly`, `jumpk`, `hit`, `cmd` (cualquier comando una vez, como se escribe en la lista de golpes: `scn=cmd&cmd=f,f+4`; con `cmd2=2&at2=14` el segundo luchador hace también uno, empezando ese fotograma, para ver contraataques o un golpe que pilla al rival a la pata coja) y `ai` (combate real entre dos IA, con `lvl=1..5` y `start=` para saltar fotogramas), con `dist=` y `noguard=1`. La cámara puede ser `cam=side|front|feet|hands|top` o `cam=custom&cp=x,y,z&cl=x,y,z&fov=` (posición y punto al que mira, en x y z relativos al luchador), para ver de cerca, por ejemplo, la mano de un barrido desde su lado. Con `nosway=1` el pelo no se balancea y con `nocloth=1` no se mueve la ropa (para comparar tiras con y sin ellos); `cor=0` vuelve al *skinning* lineal de las manos. Con `thumb=` se prueba otro cierre del pulgar en el puño.
- `viewer.html?face={"hueso":[rx,ry,rz,dx,dy,dz]}`: gira (radianes) y desplaza (metros, en el sistema del personaje: x a su izquierda, y arriba, z adelante) huesos de la cara, para probar gestos antes de llevarlos a `FACE_EXPR` (`js/anim/rig.js`, en milímetros); con `hide=hair,hair_soft` se esconde el pelo para ver las cejas.
