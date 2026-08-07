/**
 * @file command.factory.ts
 * @description Factory for instantiating concrete ICommand instances from serialized JSON envelopes.
 */

import type { CommandEnvelope, ICommand } from './command.interface';
import { CreateOrderCommand, type CreateOrderPayload } from './create-order.command';
import { UpdateOrderCommand, type UpdateOrderPayload } from './update-order.command';
import { MergeTableCommand, type MergeTablePayload } from './merge-table.command';
import { MergeBillCommand, type MergeBillPayload } from './merge-bill.command';
import { SplitBillCommand, type SplitBillPayload } from './split-bill.command';
import { PaymentCommand, type PaymentPayload } from './payment.command';
import { DeleteDraftCommand, type DeleteDraftPayload } from './delete-draft.command';
import { CancelOrderCommand, type CancelOrderPayload } from './cancel-order.command';

export class CommandFactory {
  /**
   * Deserializes a CommandEnvelope object into a concrete ICommand instance
   */
  static fromEnvelope(envelope: CommandEnvelope): ICommand {
    const options = {
      id: envelope.id,
      priority: envelope.priority,
      dependencies: envelope.dependencies,
    };

    switch (envelope.actionName || envelope.endpoint) {
      case CreateOrderCommand.ACTION_NAME:
      case CreateOrderCommand.ENDPOINT:
        return new CreateOrderCommand(envelope.payload as unknown as CreateOrderPayload, options);

      case UpdateOrderCommand.ACTION_NAME:
      case UpdateOrderCommand.ENDPOINT:
        return new UpdateOrderCommand(envelope.payload as unknown as UpdateOrderPayload, options);

      case MergeTableCommand.ACTION_NAME:
      case MergeTableCommand.ENDPOINT:
        return new MergeTableCommand(envelope.payload as unknown as MergeTablePayload, options);

      case MergeBillCommand.ACTION_NAME:
      case MergeBillCommand.ENDPOINT:
        return new MergeBillCommand(envelope.payload as unknown as MergeBillPayload, options);

      case SplitBillCommand.ACTION_NAME:
      case SplitBillCommand.ENDPOINT:
        return new SplitBillCommand(envelope.payload as unknown as SplitBillPayload, options);

      case PaymentCommand.ACTION_NAME:
      case PaymentCommand.ENDPOINT:
        return new PaymentCommand(envelope.payload as unknown as PaymentPayload, options);

      case DeleteDraftCommand.ACTION_NAME:
      case DeleteDraftCommand.ENDPOINT:
        return new DeleteDraftCommand(envelope.payload as unknown as DeleteDraftPayload, options);

      case CancelOrderCommand.ACTION_NAME:
      case CancelOrderCommand.ENDPOINT:
        return new CancelOrderCommand(envelope.payload as unknown as CancelOrderPayload, options);

      default:
        throw new Error(`[CommandFactory] Unknown command type: ${envelope.actionName || envelope.endpoint}`);
    }
  }
}
