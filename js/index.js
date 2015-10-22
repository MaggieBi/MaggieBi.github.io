'user strict';

// global variable
var photoArr = [];
var timerID = null;

// utils functions
function stringify(params) {
	var result = '?';
	var count = 0;
	for (var key in params) {
		if (count++) {
			result += '&';
		}
		result += encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
	}
	return result;
}

function clamp(num, min, max) {
	return Math.min(Math.max(num, min), max);
}

// http protocol class that returns a promise
function http(url) {
	var ajax = function(method, url, params) {
		var promise = new Promise(function(resolve, reject) {
			var xhttp = new XMLHttpRequest();
			var finalUrl = url;

			if (params && (method === 'POST')) {
				finalUrl += this.stringify(params);
			}
			xhttp.open(method, finalUrl, true);
			xhttp.send();

			xhttp.onload = function() {
				if (this.status >= 200 && this.status < 300) {
					resolve(this.responseText);
				} else {
					reject(this.statusText);
				}
			};

			xhttp.onerror = function() {
				reject(this.statusText);
			};
		}); 
		return promise;
	};

	// no support for PUT or DELETE since we will never use them here
	return {
		'get': function(params) {
			return ajax('GET', url, params);
		},
		'post': function(params) {
			return ajax('POST', url, params);
		}
	};
}

// Flickr API call utils
var FlickrService = {
	flickrApiKey: 'e425a81e5ae8f4397e5b3cab95a72940',
	flickrApiUrl: 'https://api.flickr.com/services/rest/',
	photos: null,
	error: null,
	requestDone: false,

	getParamsByMethod: function(method) {
		return {
			'method': method,
			'nojsoncallback': 1,
			'format': 'json',
			'api_key': this.flickrApiKey
		};
	},

	getInterestingPics: function(callback, errCallback) {
		var params = this.getParamsByMethod('flickr.interestingness.getList');
		var cb = {
			success: function(data) {
				callback(JSON.parse(data), errCallback);
				clearTimeout(timerID);
			},
			err: function(data) {
				errCallback(JSON.parse(data));
				clearTimeout(timerID);
			}
		};

		this.send(params, cb);
	},

	send: function(params, callback) {
		http(this.flickrApiUrl)
		.post(params)
		.then(callback.success, callback.err);
	},
};

// Class for each photo
function FlickrPhoto(params) {
	this.title = params.title;
	this.farm = params.farm;
	this.secret = params.secret;
	this.id = params.id;
	this.owner = params.owner;
	this.server = params.server;
	// According to Flickr API, how image urls are formatted
	this.url = 'https://farm' + this.farm + '.staticflickr.com/' + this.server + '/' +
						this.id + '_' + this.secret + '.jpg';

	this.loadImg = function() {
		return new Promise(function(resolve, reject) {
			var request = new XMLHttpRequest();
			console.log(this.url);
			request.open('GET', this.url);
			request.responseType = 'blob';

			request.onload = function() {
				if (request.status === 200) {
					resolve(request.response);
				} else {
					reject('Failed to load image; error code:' + request.statusText);
				}
			};

			request.onerror = function() {
				reject('There was a network error.');
			};

			request.send();
		}.bind(this));
	};

	// Need high quality image for the cover picture
	// Hacky way of getting the url for a higher-quality version of it 
	this.getLargeUrl = function() {
		return this.url.substring(0, this.url.length - 4) + '_h.jpg';
	};
}

// Lightbox class that holds states
function LightBox(photos) {
	this.photos = photos
	// Keeps track of which image is the current one displaying
	this.curIndex = 0;
	this.current = this.photos[this.curIndex];

	this.render = function() {
		var div = document.getElementById('lightbox-image');
		this.current.loadImg()
			.then(function(response) {
				// If not initialized yet, we put in a new Image
				if (div.querySelectorAll('img').length === 0) {
					var titleDiv = document.createElement('div');
					titleDiv.id = 'img-title';
					titleDiv.innerHTML = this.current.title;

					var img = new Image();
					img.src = this.current.url;

					div.appendChild(img);
					div.appendChild(titleDiv);
				} else {
					// Otherwise, we just change the src url and title
					var img = div.querySelectorAll('img')[0];
					img.src = this.current.url;
					document.getElementById('img-title').innerHTML = this.current.title;
				}
			}.bind(this), function(err) {
				// If err in loading picture, display a broken image placeholder
				var img = div.querySelectorAll('img')[0];
				img.src = 'https://s.yimg.com/pw/images/en-us/photo_unavailable_h.png';
				document.getElementById('img-title').innerHTML = "Loading Image Failed";
			}.bind(this));
	};

	this.nextImage = function() {
		// clamp makes sure no index out of range problem
		this.curIndex = clamp(this.curIndex + 1, 0, this.photos.length - 1);
		this.current = this.photos[this.curIndex];
		// Rerenders the new current image
		this.render();
	};

	this.prevImage = function() {
		// clamp makes sure no index out of range problem
		this.curIndex = clamp(this.curIndex - 1, 0, this.photos.length - 1);
		this.current = this.photos[this.curIndex];
		// Rerenders the new current image
		this.render();
	};
}

// generic error handling function that displays an error message on an overlay
function displayErr(err) {
	var errDiv = document.createElement('div');
	errDiv.id = 'err';
	errDiv.innerHTML = '<p>' + err + '</p>';
	document.body.appendChild(errDiv);
}

// Upon receiving photo data back, converts it into a FlickrPhoto object array
function getPhotos(res, errCallback) {
	if (res.stat == 'ok') {
		res.photos.photo.forEach(function(item) {
			photoArr.push(new FlickrPhoto(item));
		});
	} else if (res.stat == 'fail' && res.message) {
		errCallback(res.message);
	}
}

function isLightBoxVisible() {
	return document.getElementById('lightbox-container').style.display === 'block';
}

function showLightbox() {
	var lightbox = document.getElementById('lightbox-container');
	lightbox.style.display = 'block';
	var container = document.getElementById('container');
	container.style.backgroundColor = 'rgba(0,0,0,0.3)';
}

function closeLightbox() {
	var lightbox = document.getElementById('lightbox-container');
	lightbox.style.display = 'none';
	var container = document.getElementById('container');
	container.style.backgroundColor = 'rgba(0,0,0,0)';
}

function render(res, errCallback) {
	clearTimeout(timerID);
	getPhotos(res, errCallback);

	renderGallery(errCallback);
	renderLightBox();
}

function renderLightBox() {
	var lb = new LightBox(photoArr);
	lb.render();

	document.addEventListener('keydown', function(e){
		if (isLightBoxVisible()) {
			if (e.keyCode === 27) {
				closeLightbox();
			} else if (e.keyCode === 37) {
				lb.prevImage();
			} else if (e.keyCode === 39) {
				lb.nextImage();
			}
		}
	});

	var prevButton = document.getElementById('prevBtn');
	var nextButton = document.getElementById('nextBtn');
	var closeButton = document.getElementById('closeBtn');

	prevButton.addEventListener('click', lb.prevImage.bind(lb));
	nextButton.addEventListener('click', lb.nextImage.bind(lb));
	closeBtn.addEventListener('click', closeLightbox);
}

function renderGallery(errCallback) {
	var gallery = document.getElementById('gallery');
	console.log(gallery.childNodes);
	var imgContainer = document.createElement('div');
	imgContainer.id = 'imgContainer';
	if (photoArr.length > 1) {
		var div = document.createElement('div');
		div.id = 'gallery-cover';
		photoArr[0].loadImg()
			.then(function(response) {
				var img = new Image();
				img.src = this.getLargeUrl();
				div.appendChild(img);
			}.bind(photoArr[0]), function(err){
				errCallback('Failed to load image cover.');
			})
		imgContainer.appendChild(div);
		document.getElementById('gallery-container')
					.addEventListener('click', showLightbox, true);
	}
	gallery.replaceChild(imgContainer, gallery.childNodes[1]);
}

(function(){
	// Get data from Flickr API
	FlickrService.getInterestingPics(render, displayErr);
	// Set a timeout to check if 5s later no photo data received, display error
	timerID = setTimeout(function() {
		if (!photoArr || photoArr.length == 0) {
			displayErr('Failed to load images from Flickr.');
		}
	}, 5000);
})();



