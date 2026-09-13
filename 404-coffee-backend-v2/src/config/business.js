export function loadBusinessConfig(config) {
  return Object.freeze({ ...config.business });
}

export function getPricingSnapshot(businessConfig) {
  return Object.freeze({
    currency: businessConfig.currency,
    taxRate: businessConfig.taxRate,
    serviceRate: businessConfig.serviceRate,
    deliveryFee: businessConfig.deliveryFee
  });
}

export function getBusinessProfileSnapshot(businessConfig) {
  return Object.freeze({
    name: businessConfig.name,
    address: businessConfig.address,
    timezone: businessConfig.timezone,
    currency: businessConfig.currency
  });
}
