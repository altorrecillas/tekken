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
- `.gitignore` deja fuera la carpeta `_sin_usar/` (ficheros que el juego no usa; se puede borrar) y las fotos originales de los luchadores.

## Modos

| Modo | Descripción |
|---|---|
| Arcade | Te enfrentas a los otros seis, uno tras otro (la pantalla de carga indica «COMBATE X DE 6»). Al vencerlos a todos eres **Campeón del barrio** y ves el **final** de tu luchador. La CPU se endurece en cada combate y los escenarios se alternan. |
| Versus → 2 jugadores | Dos jugadores en la misma pantalla, con teclado o mandos (en un móvil o tablet sin mando aparece atenuado: hace falta un mando). En la selección se elige escenario con arriba / abajo (**W/S** o las flechas) o con las flechas ◀ ▶. |
| Versus → Online | Dos jugadores, **cada uno en su móvil**, por WiFi (o por QR sin internet). Ver [Versus online](#versus-online-dos-móviles). |

Los dos versus están en el submenú **VERSUS** del menú principal.

**Versión:** el número de versión se ve en pequeño en la esquina inferior izquierda de los menús (por ejemplo «v0.69»). Así se sabe qué versión ha cargado cada móvil, porque GitHub Pages y los navegadores guardan los ficheros en caché un rato. Está en `js/version.js` y **hay que subirlo con cada cambio que se publique**. Dos móviles con versiones distintas no pueden jugar online juntos: el que se une recibe un aviso con las dos versiones.
| Entrenamiento | Sparring configurable, grabación del rival, historial de entradas y pruebas de combo. Ver [Entrenamiento](#entrenamiento). |

**Dificultad** (menú principal, se recuerda entre partidas): **Fácil**, **Normal** o **Difícil**. Fija el nivel de la CPU en cada uno de los seis combates del arcade.

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

- **El Porche**: una calle real del barrio, sacada de una foto: la planta baja es la foto limpia (sin interfaz de mapas, personas ni número de portal), con las persianas llenas de grafitis, las columnas de piedra y un aparcamiento cubierto con profundidad real, fluorescentes (uno parpadea) y la barrera amarilla y negra. Encima, ventanales industriales y una marquesina de hormigón. Día nublado, plátanos de sombra, farolas y contenedores. Los edificios vecinos y los de enfrente reutilizan trozos de la foto en sus plantas bajas.
- **Azotea al atardecer**: terraza con piscina, palmeras y el pueblo iluminándose frente al mar.
- **La Meta 10K**: la meta de una carrera popular en una avenida, con arco hinchable, reloj de carrera, público animando y una plaza.
- **El Festival**: el escenario al aire libre de las fiestas del barrio, al atardecer, a partir de una foto. La concha del escenario con su pantalla LED, las torres con lonas, el cartel de la cabina del DJ, la tarima de madera, el cañizo, los pinos y el hormigón de la plaza salen de la foto, limpia: sin la chica de blanco, sin la gente del escenario ni el vigilante, sin la fecha, y con la marca de ron de las lonas cambiada por «PUÑOS DE BARRIO» (`tools/festival_prep.py`). Alrededor, en 3D: la tarima con barandillas de andamio, la cabina con los platos, torres de luces, la carpa del técnico de sonido, una barra, un food truck, guirnaldas de bombillas, focos móviles que barren a ritmo de música y público bailando. Música: «Pamgaea».

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
| Noemí | «Tranquilo, la ambulancia ya está avisada.» |

Las frases se cambian en `tools/quotes_tts.py` (texto, voz y tono; `INTROS` las de presentación, que se generan con `--intro`) y en `js/fight/styles.js`: `say` y `introSay` son los subtítulos, y `sayLen` e `introLen` lo que dura cada una en fotogramas, que la herramienta imprime al generarlas.

## Tecnología

- **Render:** PBR de Three.js con cadena HDR: MSAA, GTAO, bloom, profundidad de campo en las cinemáticas y un pase final con tonemapping AgX, grading CDL por escenario, viñeta y grano.
  - **Profundidad de campo** (presentación, K.O. y victoria, en calidad alta y ultra; `CineDOF` en `js/engine/post.js`): el fondo se desenfoca como con un teleobjetivo y el enfoque sigue al personaje. El pase de profundidad respeta el recorte de las tarjetas de pelo (antes el pelo era un bloque sólido y dejaba un halo nítido de fondo alrededor de la cabeza) y deja fuera chispas y polvo. El desenfoque recoge muestras en espiral y cada una cuenta solo hasta donde llega su propio desenfoque, así que un luchador enfocado no mancha de color el fondo borroso que tiene detrás.
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
- **Audio:** golpes, pasos, caídas y ambiente grabados; música, público y voces grabados.
  - **Golpes grabados** (`assets/sfx/fight.mp3`, 233 KB, con su tabla `fight.json`; los prepara `tools/sfx_build.py`): puñetazos ligeros y fuertes, golpes sordos al cuerpo, bofetadas, bloqueos con un golpe seco de madera, pasos en cemento o en la tarima del festival y silbidos de los golpes al aire. Cada impacto elige una de las cinco tomas al azar (nunca la misma dos veces seguidas), con un poco de variación de tono y volumen, y se mezcla en capas: una patada lleva el puñetazo más grave y un golpe al cuerpo; un golpe fuerte, además, un grave sintetizado para que pese. Un contraataque suena con un chasquido seco, y el golpe que deja K.O., con un retumbe largo. El silbido suena justo antes de que el golpe pueda llegar, no al empezar el movimiento. Mientras el archivo no ha cargado, suenan los golpes sintetizados de antes. Grabaciones CC0 de [Kenney](https://kenney.nl/assets/impact-sounds) y [artisticdude](https://opengameart.org/content/swishes-sound-pack).
  - **Ambiente de cada escenario** (`tools/ambience_build.py`, bucles sin cortes bajo la música): una calle con tráfico en El Porche (IgnasD) y una tarde al aire libre en la azotea (Kresiek The Furry), ambas CC0. Cuando un luchador habla, la música baja un poco para que se le entienda.
  - **Cámara lenta** (K.O., Rage Art): la música y el ambiente se apagan bajo un filtro, como si el mundo se detuviera, mientras los golpes, las voces y la ovación del público siguen nítidos; vuelven al recuperar la velocidad.
  - **Música** en `assets/music/` (unos 10 MB, se reproduce en streaming, una pista a la vez): «Latin Industries» en los menús, «Exit the Premises» en la azotea, «Club Diver» en la calle, «MTA» en El Porche y «Pamgaea» en El Festival, de [Kevin MacLeod](https://incompetech.com) con licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Graves por debajo de 32 Hz recortados y volumen normalizado a −16 LUFS para que suene limpia también en el altavoz del móvil.
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

- `tools/pipeline/`: pipeline de construcción de personajes en Python. El punto de entrada es `buildchar.py`; los parámetros de cada luchador están en `people.py` y la ropa en `outfits.py`. `hairgen.py` genera el pelo con tarjetas (la melena rizada de Noemí es `grow_bob`) y `garments.py` la ropa (bata con escote en V recto y caída desde el pecho). `noemi_photo.py` prepara su foto: borra el micrófono del casco que le cruza la mandíbula. Las texturas de mechones `hair_cards_s.png` y `hair_cards_curly_s.png` (las de Alejandro, Arnau, Camilo, Rafa y Dani, y las que toma un luchador nuevo) tienen la raíz densa en la raíz de cada tarjeta y la hacen aparecer poco a poco en el primer 7 % del mechón: el pelo se ve lleno y su nacimiento no dibuja una línea dura de peluca. Las `_r` tienen la raíz densa sin ese difuminado; la melena de Noemí usa `hair_cards_curly_r.png`, que en su raya queda mejor. Las primeras, `hair_cards.png` y `hair_cards_curly.png`, estaban invertidas: dejaban transparente el primer cuarto de cada mechón (pelo ralo, con el cuero cabelludo pintado a la vista); se quedan solo como referencia. `meshfmt.py` lee y escribe las mallas en sus dos formatos (el cuantizado es el que se publica; `python3 meshfmt.py <carpeta>` convierte una del formato antiguo y dice el error máximo de cada dato). `keeppart.py <carpeta vieja> <carpeta nueva> hair` devuelve a una reconstrucción el pelo de la versión aprobada: al volver a generar un luchador la cabeza se mueve fracciones de milímetro y los mechones aleatorios salen distintos, aunque el peinado sea el mismo. La barba de Dani lleva en el canal verde de `beard_d.png` la proporción de canas de cada zona (más blanca en la barbilla).
- `tools/festival_prep.py`: limpia la foto del escenario del festival y saca sus texturas (`assets/stage/fest_*`).
- `tools/sfx_build.py <carpeta de Kenney> <carpeta de swishes>`: prepara los golpes grabados (`assets/sfx/fight.mp3` y `fight.json`): recorta cada toma, iguala el volumen de las tomas de cada grupo y las junta en un solo archivo con la tabla de dónde empieza cada una.
- `tools/ambience_build.py <escenario> <grabación>`: prepara el ambiente de un escenario (`assets/sfx/amb_<escenario>.mp3`): filtra, suaviza los momentos fuertes y hace un bucle sin cortes.
- `tools/quotes_tts.py <carpeta de voces> [--intro] [luchadores]`: genera con Piper las frases de victoria o, con `--intro`, las de presentación, e imprime en qué fotograma acaba cada una.
- `tools/*.mjs`: capturas headless con Playwright (`shot.mjs`), pruebas de flujo de menús (`flow.mjs`, `flow2.mjs`), simulación de combates sin gráficos para equilibrar (`simtest.mjs` y `rr.sh`) y horneado del público (`crowdbake.mjs`). Las herramientas localizan el juego a partir de su propia carpeta; la variable `GAME_ROOT` permite apuntar a otra copia.
- Móvil:
  - `tools/mshot.mjs`: capturas con perfiles de móvil y tablet (844×390 @3x, 667×375 @2x, vertical, 1180×820 @2x).
  - `tools/mtouch.mjs`: prueba los controles táctiles con toques multitáctiles reales (menús, joystick, botones, pulsaciones dobles, deslizamientos, pausa, opciones); son 20 comprobaciones.
  - `tools/arcadetest.mjs`: juega el modo arcade completo (los seis rivales, pantalla de carga «COMBATE X DE 6», resultados de cada combate, banner de campeón y vuelta al menú) y comprueba que cada combate carga exactamente dos luchadores.
  - `tools/resultstest.mjs`: un combate de arcade jugado entero por dos CPU. Comprueba la pantalla de resultados, la jugada del combate, que su repetición a cámara lenta es el combate fotograma a fotograma (vida y posición de los dos) y el paso al siguiente rival.
  - `tools/extrastest.mjs`: EXTRAS y desbloqueos. Arcade ganado, final del campeón (texto que se escribe solo, un toque lo muestra entero), logros con sus avisos, galería de finales, cabezones, el traje de campeón en la selección y los trajes distintos en un combate espejo.
  - `tools/loadprof.mjs [Mbps] [latencia]`: mide la primera carga con una red de móvil simulada (20 Mbps por defecto): cuándo se ve la pantalla de carga, cuándo se puede usar el título, cuántos MB se han bajado hasta entonces, las fases del arranque y los ficheros que más pesan.
  - `tools/preloads.py`: regenera en `index.html` la lista de módulos que el navegador pide de golpe al empezar.
  - `tools/controlstest.mjs [salida]`: prueba los controles configurables en el juego real: cambiar teclas con clic y tecla, los intercambios (también entre jugadores), Esc, Supr, las teclas reservadas, un mando simulado que maneja la pantalla y cambia botones, RESTAURAR, que todo siga tras recargar, que los menús sigan las teclas nuevas, un combate con la tecla y el botón nuevos, la pausa y la ayuda de EXTRAS; y que un guardado estropeado no rompa nada.
  - `tools/wintest.mjs [salida] [--fighters a,b] [--shots]`: gana un combate con cada luchador y comprueba su frase de victoria: empieza en su fotograma, sale el subtítulo, la boca se abre con ella, un botón no la corta y el móvil de Camilo solo aparece en su gesto. `--shots` guarda una captura de cada uno a media frase.
  - `tools/trainingtest.mjs [salida] [--fighters a,b]`: juega todas las pruebas de combo de todos los luchadores con un jugador guionizado que prueba distintos tiempos, y falla si alguna no se puede hacer. Además, el bloqueo del sparring, el historial de entradas y la grabación y su repetición.
  - `tools/continuetest.mjs [salida]`: el «continuar» del arcade. Simula que el juego pasa a segundo plano a mitad de combate y se cierra. Comprueba que al volver aparece CONTINUAR, que el combate sigue exactamente igual (fotograma, vida, posiciones, reloj y rival), la cuenta atrás, el guardado solo cada pocos segundos, GUARDAR Y SALIR, el paso al siguiente rival y el borrado al ser campeón.
  - `tools/voicetest.mjs` y `tools/musictest.mjs`: cargan y reproducen todas las voces y gritos, las frases de victoria y de presentación (con la boca moviéndose), y la música del menú y de los escenarios (cambios de pista, pausa al ocultar la página, público de la calle).
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
