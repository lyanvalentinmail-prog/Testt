# Testt Bot para WhatsApp

Bot de WhatsApp hecho con **Baileys**, compatible con inicio mediante **código QR** o **pairing code** y preparado para ejecutarse en **Termux**.

## Funciones

- `.menu`: muestra el nombre del bot y un botón **Abrir lista**.
- `Test1`: muestra la versión del bot.
- `Test2`: muestra el prefijo.
- `Test3`: muestra el nombre del bot.

También se pueden escribir directamente `.test1`, `.test2` y `.test3`.

## Instalar en Termux

```bash
pkg update -y
pkg install nodejs-lts git -y
git clone <URL-DEL-REPOSITORIO>
cd Testt
npm install
npm start
```

Al iniciar, elige:

1. **QR**: abre WhatsApp en el teléfono, entra a **Dispositivos vinculados > Vincular dispositivo** y escanea el QR de Termux.
2. **Pairing code**: escribe el número completo con código del país, sin `+`, espacios ni guiones. Después introduce el código mostrado en **Dispositivos vinculados > Vincular con número de teléfono**.

También puedes iniciar el método directamente:

```bash
npm start -- qr
npm start -- pairing
```

Para pairing sin preguntas interactivas:

```bash
LOGIN_METHOD=pairing PHONE_NUMBER=521234567890 npm start
```

## Configuración

Edita `config.js` para cambiar el nombre, la versión o el prefijo:

```js
module.exports = {
  botName: 'Testt Bot',
  version: '1.0.0',
  prefix: '.',
};
```

La sesión se guarda en `session/` y no se sube a Git. No compartas esa carpeta. Para vincular otra cuenta, detén el bot y elimina `session/`.

> Este proyecto no usa la API oficial de WhatsApp. Úsalo de forma responsable; automatizaciones no autorizadas pueden ocasionar restricciones en la cuenta.
