// @ts-nocheck
import { getDatabaseManager } from '../models/database';

async function testExtract() {
  // Initialize database.
  const dbManager = getDatabaseManager();
  await dbManager.init();

  // Dynamically import the service to avoid early initialization issues.
  const { CreateSummariesOptimizedService } = await import('../services/create-summaries-optimized.service');
  const service = new CreateSummariesOptimizedService();

  // Test payload that mimics real recipe data.
  const testRecipe = {
    id: 'test-recipe-1',
    itemInputs2D: [
      [
        {
          itemGroupId: 'ig~test',
          items: [
            { itemId: 'i~minecraft~glass~0' },
            { itemId: 'i~minecraft~dirt~0' }
          ]
        },
        null
      ]
    ],
    itemOutputs2D: [
      [
        {
          item: { itemId: 'i~minecraft~stained_glass~9' },
          stackSize: 1,
          probability: 1.0
        },
        null,
        null
      ]
    ]
  };

  console.log('=== Test extractItemIds ===\n');

  const inputs = service['extractItemIds']({
    itemInputs2D: testRecipe.itemInputs2D
  });
  console.log('Input item IDs:', inputs);

  const outputs = service['extractItemIds']({
    itemOutputs2D: testRecipe.itemOutputs2D
  });
  console.log('Output item IDs:', outputs);

  console.log('\n[OK] Test complete');
}

testExtract().then(() => process.exit(0));

