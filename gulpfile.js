var gulp        = require('gulp');
var concat      = require('gulp-concat');
var cssmin      = require('gulp-minify-css');
var rename      = require('gulp-rename');
var sass        = require('gulp-sass');
var uglify      = require('gulp-uglify');
var jade        = require('gulp-jade');


gulp.task('js', function () {

    return gulp.src('resources/js/*.js')
    .pipe(gulp.dest('public/js/'));
    /*
    return gulp.src('resources/js/*.js')
        .pipe(uglify())
        .pipe(rename({
            suffix: '.min'
        }))
        .pipe(gulp.dest('public/js/'));
      */
});

gulp.task('css', function () {
    return gulp.src('resources/sass/*.sass')
        .pipe(sass())
        .pipe(gulp.dest('public/css/'))
        .pipe(cssmin())
        .pipe(rename({
            suffix: '.min'
        }))
        .pipe(gulp.dest('public/css/'));
});
gulp.task('html', function () {
    return gulp.src(['resources/jade/*.jade'])
        .pipe( jade( {pretty: true} ) )
        .pipe( gulp.dest('public/html/'));
});


gulp.task('watch', ['css', 'js', 'html'], function () {

    gulp.watch('./resources/sass/*.sass', ['css'] );
    gulp.watch('./resources/js/*.js', ['js'] );
    gulp.watch('./resources/jade/*.jade', ['html'] );

});

gulp.task('default', ['css', 'js', 'html']);
