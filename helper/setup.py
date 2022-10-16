from setuptools import setup, find_packages

setup(
    name='scrapyard_helper',
    version='2.0',
    packages=find_packages(),
    url='',
    license='',
    author='gchristnsn',
    author_email='gchristnsn@gmail.com',
    description='',
    install_requires=['Flask', 'bs4', 'regex'],
    entry_points={
        'console_scripts': ['scrapyard_helper=scrapyard.helper:main'],
    },
    package_data={
        '': ['resources/*.png', 'resources/*.svg', 'resources/js/*.js', 'resources/*.html']
    }
)
