/* ==============================================
   CÓDIGO PARA TU ARCHIVO: index.js
   ¡VERSIÓN FINAL (NUBE) CON PETICIÓN DE DIRECCIÓN ESCRITA!
   ============================================== */

// 1. Importar las librerías
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

// 2. Configuración (Leemos las "llaves" desde el servidor de Render)
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const NUMERO_CONDUCTOR_PRUEBA = process.env.NUMERO_CONDUCTOR_PRUEBA;

// 3. Crear el servidor
const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000; 

// 4. Base de datos temporal (para recordar quién es quién y datos temporales)
let userState = {};

// 5. Función de ayuda para enviar mensajes (con botones)
const enviarMensaje = (numero, texto, botones = null) => {
    console.log(`Enviando a ${numero}: ${texto}`);
    
    let data = {
        messaging_product: 'whatsapp',
        to: numero,
    };

    if (botones) {
        data.type = 'interactive';
        data.interactive = {
            type: 'button',
            body: { text: texto },
            action: {
                buttons: botones.map(btn => ({
                    type: 'reply',
                    reply: { id: btn.id, title: btn.title }
                }))
            }
        };
    } else {
        data.type = 'text';
        data.text = { body: texto };
    }

    axios.post(
        `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`,
        data,
        { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
    ).catch(error => {
        console.error('Error al enviar mensaje de texto/botón:', error.response ? error.response.data.error.message : error.message);
    });
};

// 6. Función de ayuda para enviar UBICACIÓN
const enviarUbicacion = (numero, lat, long, nombre, direccion) => {
    console.log(`Enviando ubicación a ${numero}: ${lat},${long}`);
    
    let data = {
        messaging_product: 'whatsapp',
        to: numero,
        type: 'location',
        location: {
            latitude: lat,
            longitude: long,
            name: nombre,
            address: direccion
        }
    };

    axios.post(
        `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`,
        data,
        { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
    ).catch(error => {
        console.error('Error al enviar ubicación:', error.response ? error.response.data.error.message : error.message);
    });
};


// 7. Ruta para que Meta verifique tu Webhook (se usa 1 vez)
app.get('/webhook', (req, res) => {
    if (
        req.query['hub.mode'] === 'subscribe' &&
        req.query['hub.verify_token'] === VERIFY_TOKEN
    ) {
        res.send(req.query['hub.challenge']);
        console.log('¡Webhook verificado por Meta!');
    } else {
        res.sendStatus(403); // Prohibido
    }
});

// 8. Ruta para RECIBIR los mensajes de WhatsApp (¡Aquí están los cambios!)
app.post('/webhook', (req, res) => {
    
    console.log('Mensaje recibido:', JSON.stringify(req.body, null, 2));
    res.sendStatus(200); // Responder OK a Meta INMEDIATAMENTE

    try {
        if (!req.body.entry || !req.body.entry[0].changes || !req.body.entry[0].changes[0].value.messages || !req.body.entry[0].changes[0].value.messages[0]) {
            console.log("No es un mensaje de usuario (ej. 'read' receipt). Ignorando.");
            return; 
        }
        
        const msg = req.body.entry[0].changes[0].value.messages[0];
        const from = msg.from; // Número del usuario que envía

        if (!userState[from]) {
            userState[from] = { step: 'inicio' };
        }
        let state = userState[from];
        
        // Identificamos el tipo de mensaje.
        let textoEntrada = '';
        let tipoMensaje = msg.type; // Guardamos el tipo original

        if (tipoMensaje === 'text') {
            textoEntrada = msg.text.body; // Guardamos el texto exacto
        } else if (tipoMensaje === 'interactive' && msg.interactive.type === 'button_reply') {
            textoEntrada = msg.interactive.button_reply.id; 
        } else if (tipoMensaje === 'location') {
            textoEntrada = 'location_received';
        }

        console.log(`Procesando entrada [Tipo: ${tipoMensaje}, Texto/ID: "${textoEntrada}"] para el usuario ${from}`);
        
        // ===============================================
        // El cerebro real empieza aquí
        // ===============================================

        // --- LÓGICA DEL PASAJERO ---
        if (textoEntrada.toLowerCase() === 'hola') {
            state.role = 'pasajero'; 
            state.step = 'inicio';
            const botones = [
                { id: 'solicitar_servicio', title: 'Solicitar Servicio' }
            ];
            enviarMensaje(from, '¡Hola, buenas tardes! 🛺\nBienvenido a **Alo Santa Rosa**.\n\nTu servicio de mototaxi seguro en el distrito Gregorio Albarracín Lanchipa (GAL).', botones);
        }
        
        else if (textoEntrada === 'solicitar_servicio' && state.role === 'pasajero') {
            state.step = 'pidiendo_ubicacion';
            enviarMensaje(from, 'Para poder ofrecerte el mejor servicio, por favor comparte tu ubicación. 📍\n(Usa el clip 📎 y selecciona Ubicación)');
        }
        
        // El pasajero envía su ubicación del MAPA
        else if (textoEntrada === 'location_received' && state.role === 'pasajero' && state.step === 'pidiendo_ubicacion') {
            // --- NUEVO PASO ---
            state.step = 'pidiendo_direccion_escrita'; // Cambiamos el estado
            // Guardamos la ubicación del mapa temporalmente
            state.ubicacionMapa = { 
                lat: msg.location.latitude,
                long: msg.location.longitude,
                name: msg.location.name || 'Ubicación del Pasajero',
                address: msg.location.address || 'Ver en el mapa'
            };
            enviarMensaje(from, '¡Ubicación del mapa recibida! 👍\nAhora, por favor, escribe tu **dirección de domicilio completa** (Ej: Calle Ejemplo 123, Referencia: Frente al parque).');
        }

        // --- NUEVA LÓGICA ---
        // El pasajero escribe su dirección de domicilio
        else if (tipoMensaje === 'text' && state.role === 'pasajero' && state.step === 'pidiendo_direccion_escrita') {
            state.step = 'buscando_conductor'; // Ahora sí buscamos conductor
            state.direccionEscrita = textoEntrada; // Guardamos la dirección escrita
            
            enviarMensaje(from, '¡Dirección recibida! Estamos buscando un conductor cercano...');

            if (!NUMERO_CONDUCTOR_PRUEBA) {
                console.log("\n⚠️ ERROR: La variable de entorno 'NUMERO_CONDUCTOR_PRUEBA' no está configurada.\n");
                enviarMensaje(from, "Lo siento, no hay conductores de prueba configurados.");
            } else {
                
                if (!userState[NUMERO_CONDUCTOR_PRUEBA]) userState[NUMERO_CONDUCTOR_PRUEBA] = {};
                userState[NUMERO_CONDUCTOR_PRUEBA].role = 'conductor';
                userState[NUMERO_CONDUCTOR_PRUEBA].step = 'recibiendo_viaje';
                userState[NUMERO_CONDUCTOR_PRUEBA].pasajeroId = from; 
                
                state.conductorId = NUMERO_CONDUCTOR_PRUEBA;

                // 1. Avisar al conductor (al otro número)
                enviarMensaje(NUMERO_CONDUCTOR_PRUEBA, '¡Nueva Solicitud de Servicio! 🛺');
                
                // 2. Enviar AMBAS ubicaciones al conductor
                const ubiMapa = state.ubicacionMapa; // Recuperamos la ubicación del mapa
                enviarUbicacion(NUMERO_CONDUCTOR_PRUEBA, ubiMapa.lat, ubiMapa.long, ubiMapa.name, ubiMapa.address);
                enviarMensaje(NUMERO_CONDUCTOR_PRUEBA, `**Dirección escrita por el cliente:**\n${state.direccionEscrita}`);
                
                // 3. Enviar botón de Aceptar al conductor (al otro número)
                const botonAceptar = [
                    { id: 'aceptar_servicio', title: 'Aceptar Servicio' }
                ];
                enviarMensaje(NUMERO_CONDUCTOR_PRUEBA, '¿Quieres aceptar el servicio?', botonAceptar);
                
                // Limpiamos datos temporales
                delete state.ubicacionMapa;
                delete state.direccionEscrita;
            }
        }
        
        // --- LÓGICA DEL CONDUCTOR ---
        else if (textoEntrada === 'aceptar_servicio' && state.role === 'conductor') {
            state.step = 'aceptado';
            const pasajeroId = state.pasajeroId; 
            
            const infoConductor = { 
                nombre: "Julian Lozano (Simulado)", 
                modelo: "Moto Torito Bajaj", 
                placa: "KZ-2205"
            };
            
            // Le damos el número del conductor al pasajero
            enviarMensaje(pasajeroId, `¡Servicio confirmado! 🛺\n\nSu servicio será prestado por:\n**Nombre:** ${infoConductor.nombre}\n**Vehículo:** ${infoConductor.modelo}\n**Placa:** ${infoConductor.placa}\n\n**El número de tu conductor es: ${from}**\nPor favor, contáctalo si es necesario.`); // 'from' ahora es el conductor
            
            if(userState[pasajeroId]) userState[pasajeroId].step = 'conductor_encontrado';

            // Le damos el número del pasajero al conductor
            enviarMensaje(from, `¡Servicio aceptado! El número de tu pasajero es: **${pasajeroId}**.\nPor favor, contáctalo si es necesario.`);

            const botonesTiempo = [
                { id: 'eta_5', title: '0-5 minutos' },
                { id: 'eta_10', title: '5-10 minutos' }
            ];
            enviarMensaje(from, '¿En cuánto tiempo estimas llegar a la ubicación del cliente?', botonesTiempo);
        }
        
        else if ((textoEntrada === 'eta_5' || textoEntrada === 'eta_10') && state.role === 'conductor') {
             state.step = 'en_camino';
             const pasajeroId = state.pasajeroId;
             const tiempo = (textoEntrada === 'eta_5') ? '0-5 minutos' : '5-10 minutos';

             enviarMensaje(pasajeroId, `Tu conductor ha confirmado que llegará entre ${tiempo}. ¡Prepárate!`);
             enviarMensaje(from, 'Perfecto. El cliente ha sido notificado.');
        }
        
        else {
            if (textoEntrada.toLowerCase() !== 'hola' && state.role === 'pasajero') {
                enviarMensaje(from, 'No entendí ese comando. Escribe "hola" para iniciar.');
            }
            console.log("Comando no reconocido o fuera de flujo:", textoEntrada);
        }
        
    } catch (error) {
        console.error("Error al procesar el webhook:", error);
    }
});

// 9. Iniciar el servidor (¡Modo Nube!)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`Servidor de Webhook (MODO NUBE 2 JUGADORES) escuchando en el puerto ${PORT}`);
    console.log('¡Servidor listo y desplegado!');
    console.log(`=======================================================`);
});
