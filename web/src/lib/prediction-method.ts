export function predictionMethod(modelVersion: string): string {
  if (/v\d+_coherent/.test(modelVersion)) {
    return 'Finish order is reconciled with the probability distribution from model estimates and race simulations.'
  }
  if (modelVersion.includes('_rank_learned_')) {
    return 'Experimental ensemble finish order, with weights learned from earlier race predictions.'
  }
  if (modelVersion.includes('_rank_blend_')) {
    return 'Finish order blends machine-learning estimates with race simulations; event probabilities use separate model estimates.'
  }
  if (modelVersion.includes('_rank_simulation_')) {
    return 'Finish order comes from race simulations; event probabilities also include statistical model estimates.'
  }
  if (/v\d+_.*robust_/.test(modelVersion)) {
    return 'Robust model finish order; win and podium probabilities combine model estimates with race simulations.'
  }
  if (modelVersion.includes('v5_regaware_')) return 'ML ensemble finish order + Bayesian / Monte Carlo probabilities'
  if (modelVersion.includes('v4_regaware_')) return 'Bayesian + Monte Carlo; legacy ML estimates excluded from final order'
  return `Model: ${modelVersion}`
}
