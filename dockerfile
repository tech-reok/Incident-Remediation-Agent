# Usamos una imagen base ligera de Node.js
FROM node:20-alpine

# Establecemos el entorno de producción
ENV NODE_ENV=production

# Establecemos el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiamos los archivos de definición de dependencias
COPY src/api/package*.json ./

# Instalamos las dependencias de manera limpia y optimizada
RUN npm ci --omit=dev

# Copiamos el resto del código de la aplicación
COPY src/api/. .

# Exponemos el puerto que utiliza la API
EXPOSE 3000

# Por seguridad, cambiamos al usuario 'node' (incluido en la imagen oficial) 
# en lugar de ejecutar la app como root
USER node

# Comando para arrancar la API
CMD ["node", "index.js"]