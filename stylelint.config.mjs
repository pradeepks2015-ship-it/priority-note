// CSS की जाँच: index.html के <style> में ग़लत/दोहराए नियम, ग़लत property, अधूरे रंग आदि (stylelint-config-recommended)।
export default {
  extends: ['stylelint-config-recommended'],
  overrides: [{ files: ['**/*.html'], customSyntax: 'postcss-html' }],
  rules: {
    // बाद में आया नियम पहले वाले को बदलता है — यह जान-बूझकर है (जैसे dark mode)
    'no-descending-specificity': null,
  },
};
