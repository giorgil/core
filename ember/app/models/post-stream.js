import Ember from 'ember';

// The post stream is an object which represents the posts in a discussion as
// they are displayed on the discussion page, from top to bottom. ...

export default Ember.ArrayProxy.extend(Ember.Evented, {

	// An array of all of the post IDs, in chronological order, in the discussion.
	ids: Em.A(),
	content: Em.A(),
	store: null,
	discussion: null,

	postLoadCount: 20,

	_init: function() {
		this.clear();
	}.on('init'),

	setup: function(ids) {
		this.set('ids', ids);
		this.clear();
	},

	count: function() {
		return this.get('ids.length');
	}.property('ids'),

	firstLoaded: function() {
		var first = this.objectAt(0);
		return first && ! first.gap;
	}.property('content.@each'),

	lastLoaded: function() {
		var last = this.objectAt(this.get('length') - 1);
		return last && ! last.gap;
	}.property('content.@each'),

	// Clear the contents of the post stream, resetting it to one big gap.
	clear: function() {
		var stream = this.get('content');
		stream.enumerableContentWillChange();
		stream.clear().pushObject(Em.Object.create({
			gap: true,
			indexStart: 0,
			indexEnd: this.get('count') - 1,
			loading: true
		}));
		stream.enumerableContentDidChange();
	},

	loadRange: function(start, end, backwards) {
		var limit = this.get('postLoadCount');
		end = end || start + limit;

		// Find the appropriate gap objects in the post stream. When we find
		// one, we will turn on its loading flag.
		this.get('content').forEach(function(item) {
			if (item.gap && (
					(item.indexStart >= start && item.indexStart <= end)
					|| (item.indexEnd >= start && item.indexEnd <= end)
				)) {
				item.set('loading', true);
				item.set('direction', backwards ? 'up' : 'down');
			}
		});

		// Get a list of post numbers that we'll want to retrieve. If there are
		// more post IDs than the number of posts we want to load, then take a
		// slice of the array in the appropriate direction.
		var ids = this.get('ids').slice(start, end + 1);
		ids = backwards ? ids.slice(-limit) : ids.slice(0, limit);

		return this.loadPosts(ids);
	},

	loadPosts: function(ids) {
		if (! ids.length) {
			return Ember.RSVP.resolve();
		}

		var stream = this;
		return this.store.find('post', {ids: ids}).then(function(posts) {
			stream.addPosts(posts);
		});
	},

	loadNearNumber: function(number) {
		// Find the item in the post stream which is nearest to this number. If
		// it turns out the be the actual post we're trying to load, then we can
		// return a resolved promise (i.e. we don't need to make an API
		// request.) Or, if it's a gap, we'll switch on its loading flag.
		var item = this.findNearestToNumber(number);
		if (item) {
			if (item.get('post.number') == number) {
				return Ember.RSVP.resolve([item.get('post')]);
			} else if (item.gap) {
				item.set('direction', 'down').set('loading', true);
			}
		}

		var stream = this;
		return this.store.find('post', {
			discussions: this.get('discussion.id'),
			near: number
		}).then(function(posts) {
			stream.addPosts(posts);
		});
	},

	loadNearIndex: function(index) {
		// Find the item in the post stream which is nearest to this index. If
		// it turns out the be the actual post we're trying to load, then we can
		// return a resolved promise (i.e. we don't need to make an API
		// request.) Or, if it's a gap, we'll switch on its loading flag.
		var item = this.findNearestToIndex(index);
		if (item) {
			if (! item.gap) {
				return Ember.RSVP.resolve([item.get('post')]);
			} else {
				item.set('direction', 'down').set('loading', true);
			}
			return this.loadRange(Math.max(item.indexStart, index - 10), item.indexEnd);
		}

		return Ember.RSVP.reject();
	},

	addPosts: function(posts) {
		this.trigger('postsLoaded', posts);

		var stream = this;
		posts.forEach(function(post) {
			stream.addPost(post);
		});

		this.trigger('postsAdded');
	},

	addPost: function(post) {
		var stream = this;
		var index = this.get('ids').indexOf(post.get('id'));
		var content = this.get('content');

		// Here we loop through each item in the post stream, and find the gap
		// in which this post should be situated. When we find it, we can replace
		// it with the post, and new gaps either side if appropriate.
		content.some(function(item, i) {
			if (item.indexStart <= index && item.indexEnd >= index) {
				var newItems = [];
				if (item.indexStart < index) {
					newItems.push(Ember.Object.create({
						gap: true,
						indexStart: item.indexStart,
						indexEnd: index - 1
					}));
				}
				newItems.push(Ember.Object.create({
					indexStart: index,
					indexEnd: index,
					post: post
				}));
				if (item.indexEnd > index) {
					newItems.push(Ember.Object.create({
						gap: true,
						indexStart: index + 1,
						indexEnd: item.indexEnd
					}));
				}
				content.enumerableContentWillChange();
				content.replace(i, 1, newItems);
				content.enumerableContentDidChange();
				return true;
			}
		});		
	},

	findNearestToNumber: function(number) {
        var nearestItem;
        this.get('content').some(function(item) {
            var thisNumber = item.get('post.number');
            if (thisNumber > number) {
                return true;
            }
            nearestItem = item;
        });
        return nearestItem;
    },

    findNearestToIndex: function(index) {
    	var nearestItem;
        this.get('content').some(function(item) {
            if (item.indexStart <= index && item.indexEnd >= index) {
                nearestItem = item;
                return true;
            }
        });
        return nearestItem;
    }

});
