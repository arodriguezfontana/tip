/** Aviso cuando el pedido se guardó pero la comanda no salió por la impresora. */
export function printErrorMessage(orderId: number): string {
  return `El pedido #${orderId} se guardó, pero hubo un error al imprimir la comanda`;
}
