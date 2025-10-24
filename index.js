/* ==============================================
   CÓDIGO PARA TU ARCHIVO: index.js
   ¡VERSIÓN FINAL PARA LA NUBE (RENDER)!
   ============================================== */

// 1. Importar las librerías
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

// 2. Configuración (¡Leemos las "llaves" desde el servidor de Render!)
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const NUMERO_CONDUCTOR_PRUEBA = process.env.NUMERO_CONDUCTOR_PRUEBA; // <-- ¡También lo hacemos variable!

// 3. Crear el servidor
const app = express();
app.use(bodyParser.json());
// Render te da un puerto en 'process.env.PORT'. Para pruebas locales, usa 3000.
const PORT = process.env.PORT || 3000; 

// 4. Base de datos temporal (para recordar quién es quién)
let userState = {};

// 5. Función de ayuda para enviar mensajes (¡con botones!)
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
        console.error('Error al enviar mensaje:', error.response ? error.response.data.error.message : error.message);
    });
};


// 6. Ruta para que Meta verifique tu Webhook (se usa 1 vez)
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

// 7. Ruta para RECIBIR los mensajes de WhatsApp (¡Aquí está la magia!)
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

        // Inicializamos el estado del usuario si no existe
        if (!userState[from]) {
            userState[from] = { step: 'inicio' };
        }
        let state = userState[from];
        
        // Identificamos el tipo de mensaje.
        let textoEntrada = '';
        if (msg.type === 'text') {
            textoEntrada = msg.text.body.toLowerCase();
        } else if (msg.type === 'interactive' && msg.interactive.type === 'button_reply') {
            textoEntrada = msg.interactive.button_reply.id; 
        } else if (msg.type === 'location') {
            textoEntrada = 'location_received';
        }

        console.log(`Procesando entrada: "${textoEntrada}" para el usuario ${from}`);
        
        // ===============================================
        // El cerebro real empieza aquí
        // ===============================================

        // --- LÓGICA DEL PASAJERO (IMAGEN 1 y 2) ---
        if (textoEntrada === 'hola') {
            state.role = 'pasajero'; // Se identifica como pasajero
            state.step = 'inicio';
            const botones = [
                { id: 'solicitar_servicio', title: 'Solicitar Servicio' }
            ];
            enviarMensaje(from, '¡Hola, buenas tardes! 🚖\nSoy Automobile, la aplicación que pone en tus manos viajes seguros.\n\n¡Prepárate para disfrutar de un viaje excepcional!', botones);
        }
        
        else if (textoEntrada === 'solicitar_servicio' && state.role === 'pasajero') {
            state.step = 'pidiendo_ubicacion';
            enviarMensaje(from, 'Para poder ofrecerte el mejor servicio, por favor comparte tu ubicación. 📍\n(Usa el clip 📎 y selecciona Ubicación)');
        }
        
        // El pasajero envía su ubicación (IMAGEN 2 y 3)
        else if (textoEntrada === 'location_received' && state.role === 'pasajero' && state.step === 'pidiendo_ubicacion') {
            state.step = 'buscando_conductor';
            enviarMensaje(from, 'Ubicación recibida correctamente. Estamos buscando un conductor cercano...');

            // --- ¡Leemos el número del conductor desde las variables del servidor! ---
            if (!NUMERO_CONDUCTOR_PRUEBA) {
                console.log("\n⚠️ ERROR: La variable de entorno 'NUMERO_CONDUCTOR_PRUEBA' no está configurada.\n");
                enviarMensaje(from, "Lo siento, no hay conductores de prueba configurados.");
            } else {
                
                // Guardamos el estado para ambos números
                if (!userState[NUMERO_CONDUCTOR_PRUEBA]) userState[NUMERO_CONDUCTOR_PRUEBA] = {};
                userState[NUMERO_CONDUCTOR_PRUEBA].role = 'conductor'; // Lo marcamos como conductor
                userState[NUMERO_CONDUCTOR_PRUEBA].step = 'recibiendo_viaje';
                userState[NUMERO_CONDUCTOR_PRUEBA].pasajeroId = from; // ¡Guardamos quién es el pasajero!
                
                state.conductorId = NUMERO_CONDUCTOR_PRUEBA; // Guardamos quién es el conductor

                // 1. Avisar al conductor (al otro número)
                enviarMensaje(NUMERO_CONDUCTOR_PRUEBA, '¡Nueva Solicitud de Servicio! 🚗');
                enviarMensaje(NUMERO_CONDUCTOR_PRUEBA, `Ubicación del cliente (simulada): ${msg.location.latitude}, ${msg.location.longitude}`);
                
                // 2. Enviar botón de Aceptar al conductor (al otro número)
                const botonAceptar = [
                    { id: 'aceptar_servicio', title: 'Aceptar Servicio' }
                ];
                enviarMensaje(NUMERO_CONDUCTOR_PRUEBA, '¿Quieres aceptar el servicio?', botonAceptar);
            }
        }
        
        // --- LÓGICA DEL CONDUCTOR (IMAGEN 4) ---
        else if (textoEntrada === 'aceptar_servicio' && state.role === 'conductor') {
            state.step = 'aceptado';
            const pasajeroId = state.pasajeroId; // Recuperamos el ID del pasajero
            
            // 1. Avisar al pasajero (Simulamos los datos)
            const infoConductor = { nombre: "Julian Lozano", marca: "Toyota", modelo: "Hilux", placa: "ABC-123" };
            enviarMensaje(pasajeroId, `Su servicio 🚕 será prestado por:\nNombre: ${infoConductor.nombre}\nMarca del carro: ${infoConductor.marca}\nModelo: ${infoConductor.modelo}\nPlaca: ${infoConductor.placa}`);
            
            if(userState[pasajeroId]) userState[pasajeroId].step = 'conductor_encontrado';

            // 2. Preguntar al conductor (a su propio número)
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
            if (textoEntrada !== 'hola' && state.role === 'pasajero') {
                enviarMensaje(from, 'No entendí ese comando. Escribe "hola" para iniciar.');
            }
            console.log("Comando no reconocido o fuera de flujo:", textoEntrada);
        }
        
    } catch (error) {
        console.error("Error al procesar el webhook:", error);
    }
});

// 8. Iniciar el servidor (¡Modo Nube!)
// Render necesita que escuches en '0.0.0.0' en el puerto que él te da.
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`Servidor de Webhook (MODO NUBE 2 JUGADORES) escuchando en el puerto ${PORT}`);
    console.log('¡Servidor listo y desplegado!');
    console.log(`=======================================================`);
});