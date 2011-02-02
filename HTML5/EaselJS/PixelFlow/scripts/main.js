/*
	The MIT License

	Copyright (c) 2011 Mike Chambers

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in
	all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	THE SOFTWARE.
*/

//temp placeholder until EaselJS 0.3 is released
Stage.prototype.toDataURL = function(mimeType, backgroundColor)
{
	if(!mimeType)
	{
		mimeType = "image/png";
	}
	
	var ctx = this.canvas.getContext('2d');
	var w = this.canvas.width;
	var h = this.canvas.height;

	var data;		

	if(backgroundColor)
	{
		data = ctx.getImageData(0, 0, w, h);
		
		//store the current globalCompositeOperation
		var compositeOperation = ctx.globalCompositeOperation;

		//set to draw behind current content
		ctx.globalCompositeOperation = "destination-over";

		//set background color
		ctx.fillStyle = backgroundColor;

		//draw background on entire canvas
		ctx.fillRect(0,0,w,h);
	}

	//get the image data from the canvas
	var imageData = this.canvas.toDataURL(mimeType);

	if(backgroundColor)
	{
		//clear the canvas
		ctx.clearRect (0,0,w,h);

		//restore it with original settings
		ctx.putImageData(data, 0,0);		

		//reset the globalCompositeOperation to what it was
		ctx.globalCompositeOperation = compositeOperation;
	}
	
	return imageData;
}

//listen for when the window finishes loaded.
x$(window).load(init);

var stage, canvas, canvasWrapper;
var canvasOffset = {top:0, left:0};

//hash to store multitple drones
//when on a multitouch device
var drones = {length:0};

//the last drone that was created
var lastDrone;

//image selected by the user to pull images from
var image;

//XUI object for the overlay canvas
var canvasOverlayWrapper;

var overlayStage;

//canvas offset. we cache for performance reasons
//so we dont have to recalculate it all of the time
var canvasOverlayOffset = {top:0, left:0};

//items for the overlay graphics
var targetShape, lineShape, targetColor, lineGraphics;

var isFirefox = false;
var hasTouchSupport = false;

//event names for transform and transition end
//since webkit and mozilla based browsers have different names for each
var transformName, transitionEndName;

//Global instance so it cna be accessed from anywhere.
//this stores 
var PC = new PixelData();

//viewport dimensions for container / browser
var viewport = {height:0, width:0};

//called once the page has loaded
function init()
{
	//whether we should abort initialization
	//because we find the browser doesnt support something
	//that we need
	var abort = false;
	
	//check for canvas
	if(!Modernizr.canvas)
	{
		x$("#canvasSupport").setStyle("color", "#FF0000");
		abort = true;
	}
	
	//check for CSS transitions
	if(!Modernizr.csstransitions)
	{
		abort = true;
		x$("#transitionSupport").setStyle("color", "#FF0000");
	}	
	
	//check for CSS transforms
	if(!Modernizr.csstransforms)
	{
		abort = true;
		x$("#transformSupport").setStyle("color", "#FF0000");
	}
	
	if(abort)
	{
			//if something isnt supported that we need,
			//display the noSupport dialog
			x$("#noSupport").setStyle("display", "block");
			
			//and stop initializing
			return;
	}
	
	//XUI element for main canvas
	canvasWrapper = x$("#mainCanvas");
	
	//check if we are running in firefox
	isFirefox = (navigator.userAgent.indexOf("Firefox") != -1);	
	
	//Firefox 4 beta has support for touch events on Windows 7
	//but, i havent been able to develop on one, and since it uses
	//a different touch api than webkit, im not going to try and support
	//it right now.
	//so, basically, if its Firefox, we say not touch
	hasTouchSupport = Modernizr.touch && !isFirefox;
	
	if(!hasTouchSupport)
	{	
		//listen for mousedown on the image select screen
		x$(".imageButton").on("mousedown", onImageSelectDown);
	}
	else
	{
		//on iOS mousedown has significant lag in firing, so we 
		//listen for touchstart on touch devices
		x$(".imageButton").on("touchstart", onImageSelectDown);
		
		
		//listen for all touchmove events made in the documet
		//so we can cancel them (and prevent the user from moving
		//the page around)
		x$(document).on("touchmove", onDocumentTouchMove);
	}

	//set css style names depending on firefox / webkit
	if(isFirefox)
	{
		transformName = "-moz-transform";
		transitionEndName = "transitionend";
	}
	else
	{
		transformName = "webkitTransform";
		transitionEndName = "webkitTransitionEnd";
	}

	//check if the browser supports the canvas.toDataURL API
	//Andorid doesn't
	if(!supportsToDataURL())
	{
		//if it doesnt, disable the save image button
		x$("#saveButtonSpan").setStyle("display", "none");
	}
}

//checks whether the browser supports the Canvas.toDataURL API
//Android currently doesnt
function supportsToDataURL()
{
	//create a canvas
	var c = document.createElement("canvas");
	
	//get a data url from it
	var data = c.toDataURL("image/png");
	
	//see if it is valid
	return (data.indexOf("data:image/png") == 0);
}

//called on touchmove events in the document (unless something else captures it)
function onDocumentTouchMove(e)
{
	//this is to prevent page scroll on touch devices
	e.preventDefault();
}

//initializes the drawing canvas
function initCanvas()
{	
	//get a reference to the actual canvas element
	//todo: make sure this is the canvas element
	canvas = canvasWrapper[0];		

	//initialize the Stage instance with the Canvas. Note, 
	//canvasWrapper is a JQuery object, but stage expects
	//the actual Canvas element.
	stage = new Stage(canvas);
	
	//set autoClear to false, so the stage is not
	//cleared between renders (when stage.tick()) is called
	stage.autoClear = false;		
		
	//string to use for how to save an image
	var instructionString;
	if(hasTouchSupport)
	{	
		//we are on a touch device
		//listen for touch events for drawing
		canvasWrapper.on("touchstart", onTouchStart);
		canvasWrapper.on("touchend", onTouchEnd);
		
		instructionString = "Touch and Hold Image to Save";	
	}
	else
	{
		instructionString = "Right Click Image to Save";
		
		//if it doesnt have touch support, then we assume
		//it is a mouse based computer
		//and we display the overlay graphic
		
		//We dont show the overlay on touch devices, and currently most touch
		//devices (smart phones and tablets) are not fast enough to manager both canvases
		//ideally we could profile based on performance, but for now, we are just doing
		//it based on input
		
		//overlay canvas used to draw target and line
		//note we dynamically add it, instead of removing it so we can save
		//some processing / initialization on touch devices
		canvasWrapper.after('<canvas id="overlayCanvas"></canvas>');
		canvasOverlayWrapper = x$("#overlayCanvas");		
		
		//listen for a click event on the overlay
		canvasOverlayWrapper.on("click", onCanvasClick);
		
		//color used to draw target and line
		targetColor = Graphics.getRGB(0,0,0,.1);
		
		//stage to manage the overlay canvas. Need to get the actual
		//element from the JQuery object.
		overlayStage = new Stage(canvasOverlayWrapper[0]);		
		
		//EaselJS Shape that is drawn at the mouse point
		targetShape = new Target(targetColor);
		
		//Shape and graphic used to draw a line from the
		//Drone to the touch point
		lineShape = new Shape();
		
		//note: we redraw the graphic a lot, but just resuse the
		//same Graphics instance (by calling clear). This saves a LOT
		//of object creation
		lineGraphics = new Graphics();
		
		lineShape.graphics = lineGraphics;		
	}
	
	//set the save image instructions
	x$("#saveInstructionsSpan").inner(instructionString);
	
	//listen for when the window looses focus (so we can pause everything)
	x$(window).on("blur", onWindowBlur);	

	//set the tick interval to 24 frames per second.
	Tick.setInterval(1000/24);
	
	//listen for the tick event (time event)
	//note, the secound argument allows this listener
	//to be paused
	Tick.addListener(window, true);
	
	//pause the Tick instance, so it doesnt broadcast
	//the tick event. (We will unpause when the user clicks
	//the canvas)
	Tick.setPaused(true);
}

//called when the drawing canvas is clicked (with a mouse)
function onCanvasClick(e)
{
	//toggle pause state
	var paused = !Tick.getPaused();
	Tick.setPaused(paused);
	
	if(paused)
	{
		//we are paused
		
		//stop listening for mouse move events (and thus stop)
		//drawing
		canvasOverlayWrapper.un("mousemove", onMouseMove);

		//remove the overlay graphics from the stage
		overlayStage.removeChild(targetShape);
		overlayStage.removeChild(lineShape);
	}
	else
	{	
		//we are no longer paused
		
		//check and see if there is already a drone instance
		if(lastDrone)
		{
			//if so, remove it
			stage.removeChild(lastDrone);
		}
		
		//create a target for the new drone, based on the current canvas relative
		//position of the mouse cursor
		var t = {
			x:e.pageX - canvasOffset.left,
			y:e.pageY - canvasOffset.top
		};		
		
		//create a new drone
		lastDrone = createNewDroneOnPoint(t);
		
		//add the drone to the stage
		stage.addChild(lastDrone);
		
		//add the overlay graphics to the stage
		overlayStage.addChild(targetShape);
		overlayStage.addChild(lineShape);
		
		
		//position the overlay mouse tracking shape
		targetShape.x = t.x;
		targetShape.y = t.y;
		
		
		//start listening for mouse move events
		canvasOverlayWrapper.on("mousemove", onMouseMove);
	}

	//draw the overlay stage
	overlayStage.tick();
}

//create a new drone, using the specific target
function createNewDroneOnPoint(t)
{
	var d = new Drone(t);
	d.x = t.x;
	d.y = t.y;
	return d;
}

//called when the mouse is moved over the canvas (on mouse based devices)
function onMouseMove(e)
{
	//update the the overlay shape position, and the drone's target
	//with the current canvas relative coordinates
	targetShape.x = lastDrone.target.x = e.pageX + canvasOffset.left;
	targetShape.y = lastDrone.target.y = e.pageY + canvasOffset.top;
}

//event handler for when an image is selected on the main screen
function onImageSelectDown(e)
{	
	//unsubscribe from the event
	x$(".imageButton").un(e.type, onImageSelectDown);

	//get the image which was clicked
	image = e.target;
	
	//set the thumbnail image to load the selected image. we just pass the url
	//as the image should be cached
	x$("#thumbImage").attr("src", image.src);
	
	//get a reference to the imageSelectDiv
	var divXUI = x$("#imageSelectDiv");
	
	//initialize the canvas
	initCanvas();
	
	//update the screen and canvas dimensions
	updateCanvasDimensions();
	
	//object to set css properties
	var css = {};
	
	//note the 100 constant below is the top-padding style for the div, set in the stylesheet.
	//i should pull this from the CSS and parse it into an int (100px)
	//do a css transform and move the div off of the screen (up)
	css[transformName] = "translate(0px,"+ -(viewport.height + 100) + "px)";
	
	//listen for when the transition ends
	divXUI.on(transitionEndName, onImageSelectTransitionEnd);
	
	//set the update style
	divXUI.css(css);
	
	var creditsDiv = x$("#credits");
	
	//move the credits off the bottom of the screen with a css transform
	creditsDiv.setStyle(transformName, "translate(0px, 200px)");
	creditsDiv.on(transitionEndName, onCreditsTransitionEnd);
}

//unsubscribes the event.target from the specified event
//returns an XUI wrapper of the element that was the target of
//the event
function unsubscribeFromEvent(e)
{
	return x$(e.target).un(e.type);
}

//called when the credits transition ends
function onCreditsTransitionEnd(e)
{
	unsubscribeFromEvent(e).remove();
}

//called when the transition from the main screen ends
function onImageSelectTransitionEnd(e)
{
	//unsubscribe the event and remove the element from the dom
	unsubscribeFromEvent(e).remove();	
	
	//we have to do this here. If we do it earlier, then it glitches the 
	//gpu on ipad
	//scale the selected image and copy the pixel data
	scaleImageData();	
		
	var bottomXUI = x$("#bottomBar");
	var margin = bottomXUI.getStyle("right");
	
	bottomXUI.css({bottom:margin});
	
	var topXUI = x$("#topBar");
		topXUI.css({top:margin});	
	
	//listen for when the transition ends
	bottomXUI.on(transitionEndName, onBottomBarTransitionEnd);
}

//called when the transition to bring the bottom bar to
//the screen ends.
function onBottomBarTransitionEnd(e)
{
	//at this point we have completed the transition and are now in the
	//drawing view
	
	//unsubscribe from the event
	unsubscribeFromEvent(e);
	
	//listen for when the window resizes
	x$(window).on("resize", onWindowResize);
	
	//listen for when any of the buttons on the bottom bar are clicked
	x$(".bottomButton").on("click", onBottomButtonClick);
}

//called when any of the bottom tab buttons are pressed
function onBottomButtonClick(e)
{
	//get the data- attribute associated with the clicked link
	var action = e.target.getAttribute("data-button");
	
	//figure out which was clicked
	switch(action)
	{
		case "SAVE":
		{
			//save button was clicked
			saveImage();
			break;
		}
		case "CLEAR":
		{
			//clear button was clicked
			stage.clear();
			break;
		}
	}
}

//utility function that opens a modal dialog with a css transition
function openModalDiv()
{
	//set the display to block so the div is added to the page flow
	x$("#modalDiv").setStyle("display","block");
	
	//we have to set this small timeout, because if we change the opacity right after
	//changing the display, the css transition wont kick in
	setTimeout("openModalDivDelay()", 10);
}

//called from setTimeout while opening modal window
function openModalDivDelay()
{
	//set the opacity style to kick in the css transition
	//fade it in
	x$("#modalDiv").setStyle("opacity",1.0);
}

//utility function to close the modal dialog
function closeModalDiv()
{
	var div = x$("#modalDiv");
	
	//fade it out.
	div.setStyle("opacity",0.0);
	
	//listen for when the transition ends
	div.on(transitionEndName, onModalTransitionEnd);
}

//called when the transition to remove the modal div ends
function onModalTransitionEnd(e)
{
	//unsubscribe from the event
	unsubscribeFromEvent(e);
	
	//have to set display to none, or else it will capture mouse click
	x$("#modalDiv").setStyle("display","none");
}

function saveImage()
{		
	var imageData = stage.toDataURL("image/png", "#FFFFFF");
	
	//dont start transition until image has loaded. This is mostly
	//for smart phones, tablets, which might take a second to process the data
	//we dont want to image to tween in before it has loaded.
	x$("#saveImage").on("load", onSaveImageLoad);
	x$("#saveImage").attr("src", imageData);
	
	openModalDiv();
}

function onSaveImageLoad(e)
{
	x$("#saveImage").un("load", onSaveImageLoad);
	x$("#savePanelCloseLink").on("click", onCloseSavePanelClick);
	
	var css = {};
		css[transformName] = "translate("+ -((viewport.width / 2) + 150) +"px,0px)";
		
	x$("#savePanel").css(css);
}

function onCloseSavePanelClick(e)
{
	x$("#savePanelCloseLink").un("click", onCloseSavePanelClick);
	
	closeModalDiv();
	
	var css = {};
		css[transformName] = "translate(0px,0px)";
	
	x$("#savePanel").css(css);
			
	x$("#savePanel").on(transitionEndName, onSaveCloseTransitionEnd);
}

function onSaveCloseTransitionEnd(e)
{
	var saveImage = x$("#saveImage");
	
	saveImage.un("load", onSaveImageLoad);
	x$("#savePanel").un(transitionEndName, onSaveCloseTransitionEnd);
	saveImage.attr("src", "");
}

function scaleImageData()
{	
	var w = viewport.width;
	var h = viewport.height;
	
	var srcCanvas = x$('<canvas>');
		srcCanvas.attr("height", h);
		srcCanvas.attr("width", w);
		
	//note: dont try and access image while it is cached by
	//the GPU (i.e. as part of a CSS transition). This can lead
	//to some weird visual glitches 
	var context = srcCanvas[0].getContext("2d");
		context.drawImage(image, 0, 0, w, h);
		
	var imageData = context.getImageData(0, 0, w, h);

	if(!PC)
	{
		PC = new PixelData();
	}

	PC.imageData = imageData;			
}

/************** touch events for iOS / Android **************/

//called when a user touches the screen.
//on iOS, there is full multitouch support, and this will be called
//for each touch point.
//on Android, there is only support for single touch.
function onTouchStart(e)
{
	//prevent default so iOS doesnt try to scale / move page
	e.preventDefault();

	var startIndex = 0;
	var touch;
	var id;
	if(drones.length == 0)
	{
		touch = e.changedTouches[0];
		id = touch.identifier;
		
		canvasWrapper.on("touchmove", onTouchMove);
		
		var t = {
			x:touch.pageX - canvasOffset.left,
			y:touch.pageY - canvasOffset.top
		};
		
		lastDrone = createNewDroneOnPoint(t);
		
		addDrone(lastDrone, id);
		
		startIndex++;
	}

	var len = e.changedTouches.length;
	for(var i = startIndex; i < len; i++)
	{
		touch = e.changedTouches[i];
		id = touch.identifier;
		
		var d = lastDrone._clone();
			
		addDrone(d, id);
		
		lastDrone = d;
	}

	
	Tick.setPaused(false);
}

function addDrone(drone, id)
{
	var length = drones.length;
	
	if(drones[id])
	{
		return;
	}
	
	drones.length++;
	drones[id] = drone;
	
	stage.addChild(drone);
}

function removeDrone(id)
{
	if(!drones[id])
	{
		return;
	}
	
	var drone = drones[id];
	stage.removeChild(drone);
	
	delete drones[id];
	drones.length--;
}

//called when a touch ends on iOS and Android devices. (i.e. user lifts a finger
//from screen)
function onTouchEnd(e)
{
	//prevent default so iOS doesnt try to scale / move page
	e.preventDefault();
		
	//get a list of all the touch points that changed
	var changedTouches = e.changedTouches;
	
	//get the number of changed touch points
	var len = changedTouches.length;
	
	//loop through the changed touch points
	for(var i = 0; i < len; i++)
	{
		removeDrone(changedTouches[i].identifier);
	}
	
	if(drones.length == 0)
	{
		canvasWrapper.un("touchmove", onTouchMove);
		Tick.setPaused(true);
	}
}

//called on when a touch points moves (used on iOS / Android)
//devices.
//Note, Android only supports single touch. If there are multiple touch
//points, touchmove events will not be broadcast.
function onTouchMove(e)
{
	//prevent default so iOS doesnt try to scale / move page
	e.preventDefault();
	
	//get all of the touch points that changed / moved
	var changedTouches = e.changedTouches;
	
	//get the number of changed touch points
	var len = changedTouches.length;

	var target;
	var drone;
	var touch;
	//loop through all of the changed touch points
	for(var i = 0; i < len; i++)
	{		
		touch = changedTouches[i];
		drone = drones[touch.identifier];
		
		if(!drone)
		{
			continue;
		}
		
		drone.target.x = touch.pageX - canvasOffset.left;
		drone.target.y = touch.pageY - canvasOffset.top;
	}
}

/************** general app functions *************/

//called at each time interval. This is essentially the listener
//for Tick.addListener
function tick()
{
	//update the main stage / canvas
	stage.tick();
	
	if(canvasOverlayWrapper)
	{
		//update the overlay line
		updateLine();
	
		//rerender the overlay stage / canvas
		overlayStage.tick();
	}
}

//redraws the overlay line based on Mouse and Drone position
function updateLine()
{
	//clear previous line
	lineGraphics.clear();
	
	//stroke style
	lineGraphics.setStrokeStyle(1);
	
	//stroke color
	lineGraphics.beginStroke(targetColor);
	
	lineGraphics.moveTo(targetShape.x, targetShape.y);
	lineGraphics.lineTo(lastDrone.x, lastDrone.y);
}

//function that updates the size of the canvas based on the window size
function updateCanvasDimensions()
{
	//only run if height / width has changed
	if(viewport.height == window.innerHeight &&
		viewport.width == window.innerWidth)
	{
			return
	}
	
	viewport.height = window.innerHeight;
	viewport.width = window.innerWidth;
	
	//note that changing the canvas dimensions clears the canvas.
	canvasWrapper.attr("height", viewport.height);
	canvasWrapper.attr("width", viewport.width);
	
	//keep for debugging on android
	//console.log([document.body.clientHeight, window.innerHeight, screen.availHeight]);// 618,613,748
	
	//save the canvas offset
	canvasOffset.left = canvasWrapper.attr("offsetLeft");
	canvasOffset.top = canvasWrapper.attr("offsetTop");
	
	if(canvasOverlayWrapper)
	{
		canvasOverlayWrapper.attr("height", viewport.height);
		canvasOverlayWrapper.attr("width", viewport.width);	
		
		//todo: get direct properties
		canvasOverlayOffset.left = canvasOverlayWrapper.attr("offsetLeft");
		canvasOverlayOffset.top = canvasOverlayWrapper.attr("offsetTop");
	}	
}

/************** Window Events ************/

//called when the window looses focus
function onWindowBlur(e)
{
	//pause the Tick / time manager
	//this is so it doesnt keep drawing / using CPU
	//when the user switches away
	Tick.setPaused(true);
}

//called when the browser window is resized
function onWindowResize(e)
{
	//right now, the stage instance, doesnt expose the canvas
	//context, so we have to get a reference to it ourselves
	var context = canvasWrapper[0].getContext("2d");
	
	//copy the image data from the current canvas
	var data = context.getImageData(0, 0,
			canvas.width,
			canvas.height);
	
	//update the canvas dimensions since the window
	//has resized. Note that changing canvas dimensions, 
	//will cause it to be cleared
	updateCanvasDimensions();
	scaleImageData();
	
	//copy the data back onto the resized canvas. It is possible
	//that if the previous canvas was larger than the newly sized one
	//that we will loose some pixels (as they will be cut off)
	context.putImageData(data, 0,0);
	
	//note, we only have to do this because we have stage.autoClear set
	//to false, otherwise, the stage instance could redraw the entire canvas
	
	//only rerender the stage if the Tick manager is not paused
	if(!Tick.getPaused())
	{
		//render stage
		stage.tick();
	}
}
