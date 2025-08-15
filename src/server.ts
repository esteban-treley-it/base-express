import express from 'express'
import { app as appConfig } from './config'
import router from './routes'
import { middlewares } from './services/request'

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(middlewares.db)

app.use('/api/v1', router)

app.listen(appConfig.port, () => {
    console.log('Server is running on port', appConfig.port)
})