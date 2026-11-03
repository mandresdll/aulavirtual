/**
 * Puerto del asistente de IA institucional (EX-04). Esta entrega NO implementa funciones de IA:
 * el puerto existe para conectar más adelante el asistente del SGA sin tocar los módulos.
 *
 * Reglas para cualquier adaptador futuro (ver docs/integraciones.md):
 * - Nunca enviar datos personales (nombre, RUT, email, teléfono, notas) al proveedor.
 * - Respetar un presupuesto de uso configurable y registrar cada llamada en auditoría.
 * - Usar solo el asistente institucional del SGA, no servicios de IA de terceros directamente.
 */
export interface AiAssistantRequest {
  /** Texto sin datos personales. El adaptador debe rechazar entradas que los contengan. */
  prompt: string;
  purpose: string;
}

export interface AiAssistant {
  readonly enabled: boolean;
  complete(request: AiAssistantRequest): Promise<{ text: string }>;
}

export class DisabledAiAssistant implements AiAssistant {
  readonly enabled = false;

  async complete(_request: AiAssistantRequest): Promise<{ text: string }> {
    throw new Error('AI assistant is disabled in this release');
  }
}
