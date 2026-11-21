# SERO, sin nosotros

Tu dinero no vive en SERO. Vive en BNB Smart Chain, una red pública que no es nuestra, y solo lo mueve una llave
que crea tu teléfono a partir de lo que solo tú sabes.

Este repositorio existe para que eso siga siendo cierto el día que SERO no esté. Guarda, fuera de nuestros
servidores, lo necesario para reconstruir tu llave, encontrar tu dinero y moverlo sin pedirle permiso a nadie. Es
copia fiel de lo publicado en [web.sero.foundation](https://web.sero.foundation), con licencia MIT.

## Tu llave

`llave/sero-llave-sin-conexion.html` es la herramienta completa en un solo archivo. Se descarga, se abre en
cualquier navegador y funciona sin internet: con los mismos datos que usaste al activar tu billetera, reconstruye
tu llave privada y tu dirección. Nada sale de tu dispositivo.

Con conexión, la misma herramienta busca tu dinero en todas tus cuentas, también en las privadas donde te pagaron,
y puede juntarlo en una sola dirección. Lee la red a través de nodos públicos. Esos nodos solo recuerdan unos días
de historial: para buscar más atrás, la herramienta te pide uno que lo guarde completo y te avisa si el resultado
quedó incompleto.

La receta, para quien quiera revisarla o rehacerla:

- `sero-llave.ts`: el código fuente, extraído tal cual de la billetera.
- `sero-llave.js`: el mismo programa en un solo archivo, sin dependencias.
- `especificacion.txt`: cada paso explicado, para rehacerla en cualquier lenguaje.
- `vectores.json`: direcciones de prueba con datos ficticios. Si tu programa las reproduce, funciona igual que SERO.
- `SHA256SUMS.txt`: la huella de cada archivo.

**Cuidado con las copias.** Esta herramienta es pública y cualquiera puede copiarla para robarte. Úsala solo desde
este repositorio, desde web.sero.foundation/llave o desde el archivo que descargaste de ahí, y comprueba su huella.
SERO nunca te va a pedir que «recuperes», «valides» o «desbloquees» tu billetera.

## SERO Pay

`sero-pay/` es el SDK con el que una web cobra con SERO: su código fuente, la referencia técnica y cada versión
publicada, que no vuelve a cambiar después de publicarse.

## El contrato

`contrato/` guarda el código fuente de `SMC_06_26_C1`, el contrato de pagos desplegado en BNB Smart Chain
(chain ID 56) en `0xc872fcbc4Df48187454798Ebc94176A258832F4D`. No tiene forma de actualizarse: hace lo que dice
ese código y nada más. Su sello en Bitcoin (OpenTimestamps) prueba desde cuándo existe.

## Registro

`registro/` reúne los sellos en Bitcoin que fechan nuestro trabajo: el canon de la Biblioteca Inmutable y el
núcleo criptográfico de la billetera.

## Comprobar

Cada archivo tiene su huella en `HUELLAS-SHA256.txt`. Si una sola no coincide, ese archivo no es el nuestro.

```
sha256sum -c HUELLAS-SHA256.txt
```

## Licencia

MIT. Copyright (c) 2026 Ostermann Laboratories S.à r.l.

---

*In English.* The money of SERO users lives on BNB Smart Chain, not with SERO. This repository keeps, outside our
servers, what is needed to rebuild a SERO key, find the funds and move them without asking anyone: the offline key
tool and its specification (`llave/`), the SERO Pay SDK (`sero-pay/`), the source of the non-upgradeable payments
contract (`contrato/`) and the Bitcoin timestamps of our work (`registro/`). MIT licensed.
