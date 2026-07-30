'use strict';

/**
 * APIFeatures
 * A fluent query-builder that wraps a Mongoose Query and applies
 * filter → sort → paginate in a chainable API.
 *
 * Usage:
 *   const features = new APIFeatures(Room.find(), req.query)
 *     .filter()
 *     .sort()
 *     .paginate();
 *   const rooms = await features.query;
 */
class APIFeatures {
  /**
   * @param {mongoose.Query} query   - The base Mongoose query
   * @param {Object}         params  - req.query object
   */
  constructor(query, params) {
    this.query  = query;
    this.params = params;
    this.total  = 0;
  }

  /**
   * filter()
   * Strips pagination / sort params and converts
   * MongoDB comparison operators written as ?price[gte]=500.
   */
  filter() {
    const reserved = ['sort', 'page', 'limit', 'fields', 'search'];
    const queryObj = { ...this.params };
    reserved.forEach((k) => delete queryObj[k]);

    // Replace gte/gt/lte/lt with their $ equivalents
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (m) => `$${m}`);

    this.query = this.query.find(JSON.parse(queryStr));
    return this;
  }

  /**
   * sort()
   * Maps URL sort param to Mongoose sort spec.
   * ?sort=price-asc | price-desc | rating | newest | availability
   */
  sort() {
    const sortMap = {
      'price-asc':    { pricePerNight: 1 },
      'price-desc':   { pricePerNight: -1 },
      'rating':       { rating: -1 },
      'newest':       { createdAt: -1 },
      'availability': { isAvailable: -1, rating: -1 },
    };

    const sortKey = this.params.sort || 'availability';
    const sortSpec = sortMap[sortKey] || sortMap['availability'];
    this.query = this.query.sort(sortSpec);
    return this;
  }

  /**
   * paginate()
   * ?page=1&limit=12  (defaults: page 1, limit 12, hard cap 50)
   */
  paginate() {
    const page  = Math.max(1, parseInt(this.params.page  || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(this.params.limit || '12', 10)));
    const skip  = (page - 1) * limit;

    this._page  = page;
    this._limit = limit;

    this.query = this.query.skip(skip).limit(limit);
    return this;
  }

  /**
   * selectFields()
   * ?fields=name,price,rating   (comma-separated field list)
   */
  selectFields() {
    if (this.params.fields) {
      const fields = this.params.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    }
    return this;
  }
}

module.exports = APIFeatures;
