const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target1 = `      const refined = await generateArticleFromSources(
        allSourcesText, 
        instructions || 'Составьте краткий обзор и организуйте данные в профессиональное руководство.',
        targetMode as 'create' | 'update',
        { books, chapters },
        [...chatHistory, { role: 'user', content: newUserMessage }]
      );`;

const rep1 = `      const refined = await generateArticleFromSources(
        allSourcesText, 
        instructions || 'Составьте краткий обзор и организуйте данные в профессиональное руководство.',
        targetMode as 'create' | 'update',
        { books, chapters },
        [...chatHistory, { role: 'user', content: newUserMessage }],
        (stepLabel) => setSyncProgress({ step: 2, total: 3, label: stepLabel })
      );`;

const target2 = `      const processed = await generateArticleFromSources(
        allSourcesText, 
        instructions || 'Составьте краткий обзор и организуйте данные в профессиональное руководство.',
        targetMode as 'create' | 'update',
        { books, chapters },
        []
      );`;

const rep2 = `      const processed = await generateArticleFromSources(
        allSourcesText, 
        instructions || 'Составьте краткий обзор и организуйте данные в профессиональное руководство.',
        targetMode as 'create' | 'update',
        { books, chapters },
        [],
        (stepLabel) => setSyncProgress({ step: 2, total: 3, label: stepLabel })
      );`;

code = code.replace(target1, rep1);
code = code.replace(target2, rep2);

fs.writeFileSync('src/App.tsx', code, 'utf8');
