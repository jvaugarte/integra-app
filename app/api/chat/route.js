import Anthropic from '@anthropic-ai/sdk'

export async function POST(request) {
  try {
    const { pregunta, contexto } = await request.json()

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `Eres el asistente de acompañamiento de INTEGRA Inteligencia Integral. ${contexto}. Responde en español, máximo 3-4 oraciones.`,
      messages: [{ role: 'user', content: pregunta }]
    })

    return Response.json({ respuesta: message.content[0].text })

  } catch (error) {
    console.error('Error Anthropic:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }
}